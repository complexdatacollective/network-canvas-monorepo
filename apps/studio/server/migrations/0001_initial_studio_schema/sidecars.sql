
CREATE OR REPLACE FUNCTION sections_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'section documents are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sections_immutable
  BEFORE UPDATE ON sections
  FOR EACH ROW
  WHEN (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.doc IS DISTINCT FROM OLD.doc)
  EXECUTE FUNCTION sections_are_immutable();

DO $$ BEGIN
  PERFORM pg_advisory_xact_lock(4021775688147130);
  -- Checking existence before CREATE also supports an operator whose roles
  -- were provisioned by an administrator: PostgreSQL checks CREATEROLE before
  -- reporting duplicate_object, so catching that exception is not sufficient.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_app') THEN
    CREATE ROLE studio_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_maintenance') THEN
    CREATE ROLE studio_maintenance NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT pg_has_role(current_user, 'studio_app', 'SET') THEN
    EXECUTE format('GRANT studio_app TO %I WITH SET TRUE', current_user);
  END IF;
  IF NOT pg_has_role(current_user, 'studio_maintenance', 'SET') THEN
    EXECUTE format('GRANT studio_maintenance TO %I WITH SET TRUE', current_user);
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO studio_app, studio_maintenance', current_schema());
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO studio_app, studio_maintenance', current_schema());
END $$;

ALTER TABLE drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE sections FORCE ROW LEVEL SECURITY;
ALTER TABLE manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE leases FORCE ROW LEVEL SECURITY;
ALTER TABLE command_log FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON drafts, sections, manifests, leases, command_log TO studio_app, studio_maintenance;


DO $$ BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO studio_app, studio_maintenance', current_schema());
END $$;


CREATE OR REPLACE FUNCTION protocol_versions_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published protocol versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER protocol_versions_immutable
  BEFORE UPDATE OR DELETE ON protocol_versions
  FOR EACH ROW EXECUTE FUNCTION protocol_versions_are_immutable();

CREATE OR REPLACE TRIGGER version_sections_immutable
  BEFORE UPDATE OR DELETE ON version_sections
  FOR EACH ROW EXECUTE FUNCTION protocol_versions_are_immutable();

-- Inserting a pin after publication would change what the version assembles to
-- while its frozen manifest and hash stayed unchanged.
CREATE OR REPLACE FUNCTION version_sections_pins_are_frozen() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM protocol_versions v
    WHERE v.id = NEW.version_id
      AND v.xmin = pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'published protocol versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER version_sections_insert_frozen
  BEFORE INSERT ON version_sections
  FOR EACH ROW EXECUTE FUNCTION version_sections_pins_are_frozen();
ALTER TABLE protocols FORCE ROW LEVEL SECURITY;
ALTER TABLE protocol_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE version_sections FORCE ROW LEVEL SECURITY;
ALTER TABLE protocol_drafts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON protocols, protocol_versions, version_sections, protocol_drafts TO studio_app, studio_maintenance;


-- Pins belonging to an immutable published artifact are immutable too:
-- retracting one would change what a frozen version resolves to while its
-- manifest and hash stayed unchanged (the version_sections argument). A
-- version is published by the insert that creates it, so its pins are frozen
-- from the start; a consent document is drafted first, and its pins may be
-- retracted until it is published, the same boundary the insert guard below
-- draws. Retracted, not rewritten: a pin's referrer is its identity, and an
-- UPDATE that pointed a draft document's pin at a published version would be
-- a late pin on that version without ever passing the insert guard. Replacing
-- an asset on a draft is therefore a DELETE and an INSERT.
--
-- The maintenance purge is the other exemption, for DELETE alone: a study is
-- purged bottom-up, and `asset_references` carries no key onto its
-- heterogeneous referrer, so a published consent document's pins would
-- otherwise outlive the document — never satisfying the draft test again,
-- and holding their asset's metadata and bytes against garbage collection
-- for good.
CREATE OR REPLACE FUNCTION asset_references_published_pins_are_frozen() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.referrer_kind = 'consent_document' AND EXISTS (
    SELECT 1 FROM consent_documents d
    WHERE d.id::text = OLD.referrer_id AND d.team_id = OLD.team_id
      AND d.state = 'draft'
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'published asset references are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER asset_references_published_immutable
  BEFORE UPDATE OR DELETE ON asset_references
  FOR EACH ROW
  WHEN (OLD.referrer_kind IN ('protocol_version', 'template_version', 'consent_document'))
  EXECUTE FUNCTION asset_references_published_pins_are_frozen();

-- Freezing only UPDATE and DELETE freezes the pin set in one direction: a pin
-- INSERTed after publication also changes what a frozen version resolves to,
-- and — because the trigger above then refuses to retract it — permanently.
-- So a pin on a published referrer is admitted only while it is being
-- published, which is the version_sections argument again: for the kinds that
-- are published by the insert that creates them, `xmin` — the transaction
-- that wrote the row this statement can see — proves that; for the kind that
-- is drafted first, its state does.
--
-- Per kind, because "published" is not the same fact for each of them, and
-- because a pin the trigger above never freezes has no frozen set to protect:
--
--   protocol_version, template_version  published by the insert that creates
--                                       them, so xmin alone decides
--   consent_document                    drafted first, published later, so a
--                                       pin is free while state is 'draft'
--                                       and fixed from publication on — by
--                                       state, not xmin: a published document
--                                       is still updated (retired, restamped),
--                                       and every such update would make it
--                                       look freshly written
--   section, message_template           retractable pins (the trigger above
--                                       covers neither kind), so nothing here
--                                       constrains when they are written
--
-- A pin on one of the three frozen kinds that names no such row is refused
-- outright: it can never be retracted, and admitting it would let a pin be
-- written before the version it claims to belong to exists.
--
-- AFTER the row, so the referrer-kind check and the asset key report first
-- and this speaks only to a well-formed pin on a real asset of its team. The
-- comparison is against `id::text` rather than a cast of `referrer_id`,
-- because `referrer_id` is heterogeneous by design and a uuid cast of a
-- section hash would raise a syntax error in place of this guard's message.
CREATE OR REPLACE FUNCTION asset_reference_pin_is_written_at_publication() RETURNS trigger AS $$
DECLARE
  -- NULL when no referrer of that kind exists; true when the referrer is
  -- already published and was published by an earlier transaction.
  written_late boolean;
BEGIN
  CASE NEW.referrer_kind
    WHEN 'protocol_version' THEN
      SELECT v.xmin <> pg_current_xact_id()::xid INTO written_late
      FROM protocol_versions v
      WHERE v.id::text = NEW.referrer_id AND v.team_id = NEW.team_id;
    WHEN 'template_version' THEN
      SELECT v.xmin <> pg_current_xact_id()::xid INTO written_late
      FROM template_versions v
      WHERE v.id::text = NEW.referrer_id AND v.team_id = NEW.team_id;
    WHEN 'consent_document' THEN
      SELECT d.state <> 'draft' INTO written_late
      FROM consent_documents d
      WHERE d.id::text = NEW.referrer_id AND d.team_id = NEW.team_id;
    ELSE
      RETURN NULL;
  END CASE;

  IF written_late IS NULL THEN
    RAISE EXCEPTION 'an asset reference must name a % of its own team', NEW.referrer_kind;
  END IF;
  IF written_late THEN
    RAISE EXCEPTION 'an asset reference cannot be added to a published %', NEW.referrer_kind;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER asset_references_insert_frozen
  AFTER INSERT ON asset_references
  FOR EACH ROW EXECUTE FUNCTION asset_reference_pin_is_written_at_publication();

-- An asset row's identity and stored representation are canonical and
-- immutable, matching the first-write-wins contract src/assets.ts already
-- enforces against the object store. Only the sweep marker may move.
CREATE OR REPLACE FUNCTION assets_metadata_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'asset metadata is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER assets_metadata_immutable
  BEFORE UPDATE ON assets
  FOR EACH ROW
  WHEN (
    NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.hash IS DISTINCT FROM OLD.hash
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.media_class IS DISTINCT FROM OLD.media_class
    OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
    OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
    OR NEW.origin IS DISTINCT FROM OLD.origin
    OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id
    OR NEW.dataset_metadata IS DISTINCT FROM OLD.dataset_metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION assets_metadata_is_immutable();
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_references FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON assets, asset_references TO studio_app, studio_maintenance;


-- Closed studies are read-only, deny-by-default: a column added to `studies`
-- after this trigger fails closed instead of silently becoming writable.
CREATE OR REPLACE FUNCTION studies_closed_is_read_only() RETURNS trigger AS $$
DECLARE
  allowed text[] := ARRAY[
    'state', 'deletion_requested_at', 'purge_after', 'closed_at', 'updated_at'
  ];
BEGIN
  IF OLD.state <> 'closed' THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - allowed) IS DISTINCT FROM (to_jsonb(NEW) - allowed) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  -- `state` being writable is not a free exit. The only permitted way out of
  -- `closed` is the exact write reopenStudy makes.
  IF NEW.state <> 'closed'
     AND NOT (NEW.state = 'live' AND NEW.closed_at IS NULL) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  -- `closed_at` rides the allowlist only so the reopen above can clear it.
  -- While the study stays closed the timestamp is the archive's date of
  -- record — what the retention clock and every export header are read
  -- against — so rewriting it in place would move when the study closed with
  -- no state change to account for the move.
  IF NEW.state = 'closed' AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_closed_read_only
  BEFORE UPDATE ON studies
  FOR EACH ROW EXECUTE FUNCTION studies_closed_is_read_only();

-- Participation mode decides whether a study holds identified participants at
-- all, and `went_live_at` is the evidence that the decision has been acted
-- on. Once collection has begun under one mode, switching would reinterpret
-- data already collected — an anonymous run's sessions have no participant to
-- attribute to — and clearing the timestamp would erase the very evidence
-- that forbids the switch. Both freeze on the FIRST go-live, so a pause, a
-- close and a reopen all leave them alone; `studies_closed_read_only` catches
-- a closed study's attempt before this trigger, because neither column is on
-- its allowlist.
CREATE OR REPLACE FUNCTION studies_go_live_is_final() RETURNS trigger AS $$
BEGIN
  IF NEW.participation_mode IS DISTINCT FROM OLD.participation_mode THEN
    RAISE EXCEPTION 'a study that has gone live cannot change participation mode';
  END IF;
  IF NEW.went_live_at IS DISTINCT FROM OLD.went_live_at THEN
    RAISE EXCEPTION 'a study''s first go-live is recorded once and never rewritten';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_go_live_final
  BEFORE UPDATE ON studies
  FOR EACH ROW
  WHEN (OLD.went_live_at IS NOT NULL
        AND (NEW.participation_mode IS DISTINCT FROM OLD.participation_mode
             OR NEW.went_live_at IS DISTINCT FROM OLD.went_live_at))
  EXECUTE FUNCTION studies_go_live_is_final();

-- The retarget half of the wave-pin invariant `study_waves_version_own_line`
-- proves below. `studies.protocol_id` is nullable so a Draft can be pointed
-- at a different protocol, and the command layer clears every wave pin before
-- it does; this refuses the retarget that skipped that step, which would
-- leave pins the wave trigger admitted naming versions of the line the study
-- has just walked away from. AFTER the row, so the composite key to
-- `protocols` reports a protocol from another team first.
--
-- Alone among these guards this one refuses on a row it FINDS, so it would
-- fail open if row-level security hid the pinned wave. It cannot: the caller
-- is updating this study, so its policy has already pinned the study's team,
-- and every wave of that study carries the same team_id.
CREATE OR REPLACE FUNCTION studies_protocol_line_is_unpinned() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM study_waves w
    WHERE w.study_id = NEW.id AND w.team_id = NEW.team_id
      AND w.protocol_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a study''s protocol line cannot change while a wave still pins a version';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_protocol_line_unpinned
  AFTER UPDATE OF protocol_id ON studies
  FOR EACH ROW
  WHEN (NEW.protocol_id IS DISTINCT FROM OLD.protocol_id)
  EXECUTE FUNCTION studies_protocol_line_is_unpinned();

-- A study leaves the database by exactly one path: the maintenance purge,
-- after the retention window `deletion_requested_at` and `purge_after`
-- describe. The blanket tenant grant includes DELETE, so without this the
-- application role could remove a study whose children were gone — a draft,
-- or one marked for deletion — the moment it was asked, skipping the window.
CREATE OR REPLACE FUNCTION study_delete_is_purge() RETURNS trigger AS $$
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'studies are deleted only by the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_delete_purge_only
  BEFORE DELETE ON studies
  FOR EACH ROW EXECUTE FUNCTION study_delete_is_purge();

-- Shared by every child guard below.
CREATE OR REPLACE FUNCTION study_is_closed(p_study_id uuid, p_team_id text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = p_study_id AND s.team_id = p_team_id AND s.state = 'closed'
  );
$$ LANGUAGE sql STABLE;

-- Wave identity is immutable: sessions attach to waves, and a renumbered wave
-- would silently reattribute collected data.
CREATE OR REPLACE FUNCTION study_waves_identity_is_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.wave_number IS DISTINCT FROM OLD.wave_number
     OR NEW.study_id IS DISTINCT FROM OLD.study_id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'wave identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER study_waves_identity_immutable
  BEFORE UPDATE ON study_waves
  FOR EACH ROW EXECUTE FUNCTION study_waves_identity_is_immutable();

-- A closed study's waves are read-only, except that the maintenance purge may
-- DELETE them. The exemption is scoped to DELETE because the purge only ever
-- deletes: a maintenance INSERT or UPDATE under a closed study stays blocked
-- like any other role's. Because the `studies` trigger guards only UPDATE, it
-- is this trigger plus the no-cascade FK that makes a closed study undeletable
-- by the application role at the database level.
CREATE OR REPLACE FUNCTION study_waves_parent_is_open() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT study_is_closed(OLD.study_id, OLD.team_id) THEN
      RETURN OLD;
    END IF;
    IF current_user = 'studio_maintenance' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF study_is_closed(NEW.study_id, NEW.team_id) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER study_waves_parent_open
  BEFORE INSERT OR UPDATE OR DELETE ON study_waves
  FOR EACH ROW EXECUTE FUNCTION study_waves_parent_is_open();

-- A wave's pin must name a version of the STUDY's own protocol line. The
-- composite key on (protocol_version_id, team_id) proves only that the version
-- is the team's, so without this a writer could pin a sibling study's line and
-- leave a collecting wave running a protocol its study never chose — every
-- session of that wave then carrying a version pin that `studies.protocol_id`
-- disagrees with. A study with no line yet pins nothing: the comparison
-- against a null `protocol_id` finds no row, which is the intended refusal.
--
-- AFTER the row, so the key reports first: a version from another team is a
-- key violation, not a line mismatch.
CREATE OR REPLACE FUNCTION study_wave_version_is_own_line() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM studies s
    JOIN protocol_versions v
      ON v.id = NEW.protocol_version_id AND v.team_id = NEW.team_id
    WHERE s.id = NEW.study_id AND s.team_id = NEW.team_id
      AND v.protocol_id = s.protocol_id
  ) THEN
    RAISE EXCEPTION 'a wave''s protocol version must belong to its study''s protocol line';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER study_waves_version_own_line
  AFTER INSERT OR UPDATE OF protocol_version_id ON study_waves
  FOR EACH ROW
  WHEN (NEW.protocol_version_id IS NOT NULL)
  EXECUTE FUNCTION study_wave_version_is_own_line();

-- Participants and sessions carry their own parent-state guard: the triggers
-- above cover only `studies` and `study_waves`, so without this a buggy
-- write could still modify an archived study's collected data.
--
-- Two delete paths are exempt, and only two. The maintenance purge runs as
-- `studio_maintenance`. Participant erasure runs as `studio_app` — the same
-- role as any buggy delete — so it cannot key on `current_user`; it presents a
-- transaction-scoped marker instead, and the marker is proven against the row's
-- own participant, so it authorizes deleting exactly that participant and
-- nothing else.
CREATE OR REPLACE FUNCTION participants_are_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT study_is_closed(OLD.study_id, OLD.team_id) THEN
      -- An open study still constrains WHO may erase: outside a marked
      -- erasure or the purge, a participant delete is refused everywhere.
      IF current_user = 'studio_maintenance' OR marker = OLD.id::text THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'participant rows are deleted only by an audited erasure or the maintenance purge';
    END IF;
    IF current_user = 'studio_maintenance' OR marker = OLD.id::text THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF study_is_closed(NEW.study_id, NEW.team_id) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.id IS DISTINCT FROM OLD.id
          OR NEW.study_id IS DISTINCT FROM OLD.study_id
          OR NEW.team_id IS DISTINCT FROM OLD.team_id) THEN
    RAISE EXCEPTION 'participant identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participants_writable
  BEFORE INSERT OR UPDATE OR DELETE ON participants
  FOR EACH ROW EXECUTE FUNCTION participants_are_writable();

-- Anonymous studies hold no participants: the composite key proves only that
-- the study is the team's, so the mode is proven here. AFTER the row, so a
-- study that does not exist reports through the key first. The other
-- direction — a draft switching to anonymous over a cohort it already
-- holds — is refused on the study below; after go-live the mode is frozen.
CREATE OR REPLACE FUNCTION participants_study_is_managed() RETURNS trigger AS $$
DECLARE
  mode text;
BEGIN
  SELECT s.participation_mode INTO mode
  FROM studies s WHERE s.id = NEW.study_id AND s.team_id = NEW.team_id;
  IF mode IS DISTINCT FROM 'managed' THEN
    RAISE EXCEPTION 'anonymous studies hold no participants';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participants_study_managed
  AFTER INSERT ON participants
  FOR EACH ROW EXECUTE FUNCTION participants_study_is_managed();

CREATE OR REPLACE FUNCTION studies_mode_switch_is_unpeopled() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM participants p
    WHERE p.study_id = NEW.id AND p.team_id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'a study holding participants cannot become anonymous';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_mode_switch_unpeopled
  BEFORE UPDATE ON studies
  FOR EACH ROW
  WHEN (NEW.participation_mode = 'anonymous'
        AND OLD.participation_mode IS DISTINCT FROM 'anonymous')
  EXECUTE FUNCTION studies_mode_switch_is_unpeopled();

-- Finalization makes a session immutable, and the immutability MUST be
-- UPDATE-only: deletes stay possible, because both the maintenance purge and
-- the participant-erasure command legitimately delete finalized sessions,
-- each through its own audited path.
CREATE OR REPLACE FUNCTION interview_sessions_are_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'studio_maintenance'
       OR (marker IS NOT NULL AND marker = OLD.participant_id::text) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'interview sessions are deleted only by an audited erasure or the maintenance purge';
  END IF;

  IF study_is_closed(
       CASE WHEN TG_OP = 'INSERT' THEN NEW.study_id ELSE OLD.study_id END,
       CASE WHEN TG_OP = 'INSERT' THEN NEW.team_id ELSE OLD.team_id END) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'finalized interview sessions are immutable';
  END IF;

  -- The originating link is identity too: rebound or cleared, redemption
  -- counts and provenance would land on a token that did not produce it.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.study_id IS DISTINCT FROM OLD.study_id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.wave_id IS DISTINCT FROM OLD.wave_id
     OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
     OR NEW.protocol_version_id IS DISTINCT FROM OLD.protocol_version_id
     OR NEW.link_id IS DISTINCT FROM OLD.link_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'interview session identity and version pin are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_sessions_writable
  BEFORE INSERT OR UPDATE OR DELETE ON interview_sessions
  FOR EACH ROW EXECUTE FUNCTION interview_sessions_are_writable();

-- A link opens one wave for one participant, or for any visitor when
-- anonymous. A session citing a link of another wave or another participant
-- would attribute what it collected to whichever of the two disagrees. The
-- composite key proves the link is the team's; this proves the rest, AFTER
-- the row so the key reports first, and only when the link is set, because
-- wave and participant are immutable above.
CREATE OR REPLACE FUNCTION interview_session_link_is_own() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM interview_links l
    WHERE l.id = NEW.link_id AND l.team_id = NEW.team_id
      AND l.study_id = NEW.study_id
      AND l.wave_id = NEW.wave_id
      AND l.participant_id IS NOT DISTINCT FROM NEW.participant_id
  ) THEN
    RAISE EXCEPTION 'an interview session''s link must open its own wave for its own participant';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_sessions_link_own
  AFTER INSERT OR UPDATE OF link_id ON interview_sessions
  FOR EACH ROW
  WHEN (NEW.link_id IS NOT NULL)
  EXECUTE FUNCTION interview_session_link_is_own();

-- A session's own pin is a COPY of its wave's pin, taken at creation. The
-- composite key proves only that the version is the team's, so without this a
-- session could be created against any of the team's versions and its
-- provenance — including the snapshot's, which is proven against the session
-- rather than against the wave — would record a protocol the wave never
-- served. A wave that pins nothing takes no sessions at all: comparing against
-- a null pin finds no row, and that is the intended refusal.
--
-- INSERT only. The pin is already immutable on a session
-- (`interview_sessions_writable`), and re-pinning a wave to a newer version
-- must stay possible — that the sessions already collected keep running the
-- version they started under is the whole reason the session carries its own
-- copy.
CREATE OR REPLACE FUNCTION interview_session_version_is_wave_pin() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM study_waves w
    WHERE w.id = NEW.wave_id AND w.team_id = NEW.team_id
      AND w.protocol_version_id = NEW.protocol_version_id
  ) THEN
    RAISE EXCEPTION 'an interview session must pin the protocol version its wave pins';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_sessions_version_wave_pin
  AFTER INSERT ON interview_sessions
  FOR EACH ROW EXECUTE FUNCTION interview_session_version_is_wave_pin();

-- The same guard as sessions, minus the finalization clause.
CREATE OR REPLACE FUNCTION interview_links_are_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'studio_maintenance'
       OR (marker IS NOT NULL AND marker = OLD.participant_id::text) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'interview links are deleted only by an audited erasure or the maintenance purge';
  END IF;

  IF study_is_closed(
       CASE WHEN TG_OP = 'INSERT' THEN NEW.study_id ELSE OLD.study_id END,
       CASE WHEN TG_OP = 'INSERT' THEN NEW.team_id ELSE OLD.team_id END) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.id IS DISTINCT FROM OLD.id
          OR NEW.study_id IS DISTINCT FROM OLD.study_id
          OR NEW.team_id IS DISTINCT FROM OLD.team_id
          OR NEW.wave_id IS DISTINCT FROM OLD.wave_id
          OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
          OR NEW.kind IS DISTINCT FROM OLD.kind
          OR NEW.token_hash IS DISTINCT FROM OLD.token_hash) THEN
    RAISE EXCEPTION 'interview link identity and token are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_links_writable
  BEFORE INSERT OR UPDATE OR DELETE ON interview_links
  FOR EACH ROW EXECUTE FUNCTION interview_links_are_writable();
ALTER TABLE studies FORCE ROW LEVEL SECURITY;
ALTER TABLE study_waves FORCE ROW LEVEL SECURITY;
ALTER TABLE participants FORCE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE interview_links FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON studies, study_waves, participants, interview_sessions, interview_links TO studio_app, studio_maintenance;


-- A snapshot may only be written in the transaction that finalizes its
-- session, the version_sections_insert_frozen pattern: the document view and
-- the queryable view can never diverge, not even by one commit.
--
-- The same lookup proves the provenance columns. The composite key already
-- binds the snapshot to its session's study; the version pin is the session's
-- own, and the schema version is that pin's, or exports and provenance would
-- attribute the payload to a protocol the session never ran — permanently,
-- because the row cannot be updated.
--
-- AFTER the row, so the payload check and the two keys report first: a
-- version from another team is a key violation, not a pin mismatch.
CREATE OR REPLACE FUNCTION session_snapshots_insert_at_finalization() RETURNS trigger AS $$
DECLARE
  pinned_version uuid;
  pinned_schema_version integer;
BEGIN
  SELECT s.protocol_version_id INTO pinned_version
  FROM interview_sessions s
  WHERE s.id = NEW.session_id
    AND s.team_id = NEW.team_id
    AND s.status = 'completed'
    AND s.xmin = pg_current_xact_id()::xid;
  IF pinned_version IS NULL THEN
    RAISE EXCEPTION 'a session snapshot may only be written in the transaction that finalizes its session';
  END IF;
  IF pinned_version <> NEW.protocol_version_id THEN
    RAISE EXCEPTION 'a session snapshot must carry its session''s own protocol version pin';
  END IF;
  SELECT v.schema_version INTO pinned_schema_version
  FROM protocol_versions v
  WHERE v.id = pinned_version AND v.team_id = NEW.team_id;
  IF pinned_schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'a session snapshot''s schema version must be its protocol version''s (%)', pinned_schema_version;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER session_snapshots_insert_frozen
  AFTER INSERT ON session_snapshots
  FOR EACH ROW EXECUTE FUNCTION session_snapshots_insert_at_finalization();

-- UPDATE always raises. DELETE stays possible, because both the maintenance
-- purge and the participant-erasure command legitimately delete a finalized
-- session's snapshot, each through its own audited path.
CREATE OR REPLACE FUNCTION session_snapshots_are_immutable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'session snapshots are immutable';
  END IF;
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL AND EXISTS (
    SELECT 1 FROM interview_sessions s
    WHERE s.id = OLD.session_id AND s.team_id = OLD.team_id
      AND s.participant_id::text = marker
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'session snapshots are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER session_snapshots_immutable
  BEFORE UPDATE OR DELETE ON session_snapshots
  FOR EACH ROW EXECUTE FUNCTION session_snapshots_are_immutable();

-- The other half of the write-once rule: a finalized session must HAVE the
-- snapshot it may only write once. Flipping `status` to `completed` is what
-- freezes the session and turns its nodes and edges read-only, and
-- `session_snapshots_insert_at_finalization` shuts the snapshot window the
-- moment that transaction commits — so a commit that finalizes without
-- writing one leaves a permanently frozen interview with no exportable
-- as-collected payload and no way to supply one afterwards.
--
-- A CONSTRAINT trigger, deferred to commit, because the order of writes
-- inside the finalizing transaction is the caller's business: the seed inserts
-- a whole study's already-completed sessions, then their nodes and edges, then
-- a projection refresh, and only then the batch of snapshots. Asking at commit
-- is the only point at which every one of the transaction's snapshot inserts
-- is in, and it is exactly the point the session becomes visible to anyone
-- else.
CREATE OR REPLACE FUNCTION interview_session_completion_has_snapshot() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM session_snapshots s
    WHERE s.session_id = NEW.id AND s.team_id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'a completed interview session must carry its as-collected snapshot';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The one trigger in the schema that is dropped and recreated rather than
-- replaced: Postgres refuses `CREATE OR REPLACE CONSTRAINT TRIGGER` outright.
-- The whole sidecar is one implicit transaction, so there is no window in
-- which the guard is missing.
DROP TRIGGER IF EXISTS interview_sessions_completion_snapshot
  ON interview_sessions;
CREATE CONSTRAINT TRIGGER interview_sessions_completion_snapshot
  AFTER INSERT OR UPDATE OF status ON interview_sessions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION interview_session_completion_has_snapshot();

-- `nodes`, `edges`, `session_stats` and `session_degree_hist` all need the
-- same promise: no writes when the owning session is finalized or the owning
-- study is closed, except the purge's and the marked erasure's deletes. A
-- row-level trigger would pay two index probes on every one of millions of
-- rows; a statement-level AFTER trigger with a transition table pays one join
-- per statement, whatever the row count — and because these tables share the
-- `(team_id, session_id)` shape, one function serves all four. `changed` is
-- the transition table every trigger registers under the same name, so the
-- query is static.
--
-- The finalization test excludes sessions finalized in THIS transaction
-- (s.xmin = pg_current_xact_id()): the finalizing transaction legitimately
-- recomputes rollups and writes the snapshot after flipping status.
--
-- The guard is deliberately NOT SECURITY DEFINER. A definer function would
-- need a pinned search_path, which breaks the scratch-schema isolation the
-- suites rely on. The fail-open it would otherwise close — a `changed` row
-- whose parent is invisible under RLS — is already closed upstream: the row's
-- own WITH CHECK policy rejects a team_id that does not match the
-- transaction's context before this AFTER trigger runs, and the composite FK
-- rejects a session that does not exist.
CREATE OR REPLACE FUNCTION network_rows_parent_is_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
  offender uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'studio_maintenance' THEN
      RETURN NULL;
    END IF;
    IF marker IS NOT NULL THEN
      -- The marker authorizes exactly one participant's data.
      SELECT c.session_id INTO offender
      FROM changed c
      JOIN interview_sessions s
        ON s.id = c.session_id AND s.team_id = c.team_id
      WHERE s.participant_id IS NULL OR s.participant_id::text <> marker
      LIMIT 1;
      IF offender IS NOT NULL THEN
        RAISE EXCEPTION 'participant erasure may only delete the marked participant''s network data (session %)', offender;
      END IF;
      RETURN NULL;
    END IF;
    -- An unmarked application-role delete is an ordinary edit of a live
    -- interview: the runtime removes a node and its edges whenever a
    -- participant changes their mind, and the projection refresh rewrites
    -- session_degree_hist on every call. It is therefore governed by the
    -- parent-writable rule below exactly like an insert or an update — refused
    -- once the session is finalized or the study closed, where only the marked
    -- erasure and the maintenance purge above may delete.
  END IF;

  -- The finalizing transaction may still write under the session it has
  -- just completed (its own xmin) — but the as-collected rows only until it
  -- has taken the snapshot of them: a node or edge written after that would
  -- disagree with the immutable payload that claims to be their copy. The
  -- projections stay writable for the rest of the transaction, since they
  -- are derived from the rows and not part of the snapshot.
  SELECT c.session_id INTO offender
  FROM changed c
  JOIN interview_sessions s
    ON s.id = c.session_id AND s.team_id = c.team_id
  JOIN studies st
    ON st.id = s.study_id AND st.team_id = s.team_id
  WHERE (s.status = 'completed'
         AND (s.xmin <> pg_current_xact_id()::xid
              OR (TG_TABLE_NAME IN ('nodes', 'edges')
                  AND EXISTS (
                    SELECT 1 FROM session_snapshots sn
                    WHERE sn.session_id = s.id AND sn.team_id = s.team_id
                  ))))
     OR st.state = 'closed'
  LIMIT 1;
  IF offender IS NOT NULL THEN
    RAISE EXCEPTION 'network data for a finalized session or a closed study is read-only (session %)', offender;
  END IF;

  -- session_stats copies its session's study, wave, wave number and
  -- participant so the wave-over-wave window reads one table. The composite
  -- keys prove each copy names a real row of the same study; only a join back
  -- to the session proves they are the session's own. Same statement-level
  -- price as the check above, paid only by the table that carries copies.
  IF TG_TABLE_NAME = 'session_stats' THEN
    SELECT c.session_id INTO offender
    FROM changed c
    JOIN interview_sessions s
      ON s.id = c.session_id AND s.team_id = c.team_id
    JOIN study_waves w
      ON w.id = s.wave_id AND w.team_id = s.team_id
    WHERE c.study_id <> s.study_id
       OR c.wave_id <> s.wave_id
       OR c.wave_number <> w.wave_number
       OR c.participant_id IS DISTINCT FROM s.participant_id
    LIMIT 1;
    IF offender IS NOT NULL THEN
      RAISE EXCEPTION 'a session rollup must copy its own session''s study, wave and participant (session %)', offender;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- A trigger may declare only one transition-table clause per event, so each
-- guarded table takes three, one per verb.
CREATE OR REPLACE TRIGGER nodes_parent_writable_insert
  AFTER INSERT ON nodes REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER nodes_parent_writable_update
  AFTER UPDATE ON nodes REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER nodes_parent_writable_delete
  AFTER DELETE ON nodes REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

CREATE OR REPLACE TRIGGER edges_parent_writable_insert
  AFTER INSERT ON edges REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER edges_parent_writable_update
  AFTER UPDATE ON edges REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER edges_parent_writable_delete
  AFTER DELETE ON edges REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

CREATE OR REPLACE TRIGGER session_stats_parent_writable_insert
  AFTER INSERT ON session_stats REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_stats_parent_writable_update
  AFTER UPDATE ON session_stats REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_stats_parent_writable_delete
  AFTER DELETE ON session_stats REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

CREATE OR REPLACE TRIGGER session_degree_hist_parent_writable_insert
  AFTER INSERT ON session_degree_hist REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_degree_hist_parent_writable_update
  AFTER UPDATE ON session_degree_hist REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_degree_hist_parent_writable_delete
  AFTER DELETE ON session_degree_hist REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

-- Session reassignment is caught without a probe, so it stays row-level.
CREATE OR REPLACE FUNCTION network_row_session_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'a network row cannot change session or team';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER nodes_session_immutable
  BEFORE UPDATE ON nodes FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();

CREATE OR REPLACE TRIGGER edges_session_immutable
  BEFORE UPDATE ON edges FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();

CREATE OR REPLACE TRIGGER session_stats_session_immutable
  BEFORE UPDATE ON session_stats FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();

CREATE OR REPLACE TRIGGER session_degree_hist_session_immutable
  BEFORE UPDATE ON session_degree_hist FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();
ALTER TABLE session_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE edges FORCE ROW LEVEL SECURITY;
ALTER TABLE session_stats FORCE ROW LEVEL SECURITY;
ALTER TABLE session_degree_hist FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_snapshots, nodes, edges, session_stats, session_degree_hist TO studio_app, studio_maintenance;


ALTER TABLE study_role_grants FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON study_role_grants TO studio_app, studio_maintenance;


-- A published consent document is what participants agreed to. Its words,
-- its items, and its version number may never move afterwards; only
-- retirement may.
CREATE OR REPLACE FUNCTION consent_documents_publication_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published consent documents are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER consent_documents_publication_immutable
  BEFORE UPDATE ON consent_documents
  FOR EACH ROW
  WHEN (
    OLD.state <> 'draft'
    AND (
      NEW.study_id IS DISTINCT FROM OLD.study_id
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.locale IS DISTINCT FROM OLD.locale
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.body IS DISTINCT FROM OLD.body
      OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
      -- Retirement is one-way: a superseded version does not become current
      -- again, or new participants could consent to it after its successor.
      OR (
        OLD.retired_at IS NOT NULL
        AND (
          NEW.retired_at IS DISTINCT FROM OLD.retired_at
          OR NEW.state IS DISTINCT FROM OLD.state
        )
      )
    )
  )
  EXECUTE FUNCTION consent_documents_publication_is_immutable();

-- A numbered document version is evidence of what participants were shown,
-- published or not once it has a number: deleting one would free
-- (study_id, version) for different words under the same number. Only the
-- maintenance purge, removing the whole study bottom-up, may delete it.
CREATE OR REPLACE FUNCTION consent_document_delete_is_purge() RETURNS trigger AS $$
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'consent documents are deleted only by the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER consent_documents_delete_purge_only
  BEFORE DELETE ON consent_documents
  FOR EACH ROW EXECUTE FUNCTION consent_document_delete_is_purge();

-- Items belong to their document version. Once that version is published,
-- adding, removing, or rewording an item would change what an existing
-- consent record means. The one exception is the maintenance purge's DELETE:
-- a study is purged bottom-up, and the item key onto its document is NO
-- ACTION, so without this the document — and the study above it — could
-- never be removed once published.
CREATE OR REPLACE FUNCTION consent_items_are_frozen_after_publication() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  -- Both documents an UPDATE touches: the one the item leaves as much as
  -- the one it joins, or an item could be moved out of a published document
  -- into a draft and rewritten there.
  IF EXISTS (
    SELECT 1 FROM consent_documents d
    WHERE d.id IN (NEW.consent_document_id, OLD.consent_document_id)
      AND d.state <> 'draft'
  ) THEN
    RAISE EXCEPTION 'published consent documents are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER consent_items_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON consent_items
  FOR EACH ROW EXECUTE FUNCTION consent_items_are_frozen_after_publication();

-- The grant is evidence; only the withdrawal columns move. DELETE is guarded
-- separately below, because participant erasure (#1270) legitimately removes
-- these rows and ordinary application code never may.
CREATE OR REPLACE FUNCTION participant_consent_grant_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'participant consent grants are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consent_grant_immutable
  BEFORE UPDATE ON participant_consents
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.study_id IS DISTINCT FROM OLD.study_id
    OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
    OR NEW.consent_document_id IS DISTINCT FROM OLD.consent_document_id
    OR NEW.consent_content_hash IS DISTINCT FROM OLD.consent_content_hash
    OR NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at)
  )
  EXECUTE FUNCTION participant_consent_grant_is_immutable();

CREATE OR REPLACE TRIGGER participant_consent_item_responses_immutable
  BEFORE UPDATE ON participant_consent_item_responses
  FOR EACH ROW EXECUTE FUNCTION participant_consent_grant_is_immutable();

-- A consent captured inside a session was captured inside one of the
-- consenting participant's own sessions. The composite key proves the
-- session's study; only a lookup can prove its participant, and the grant
-- trigger above makes session_id immutable, so once at insert is enough.
-- AFTER the row, so the key reports a session of another study or team
-- first and this speaks only to a session the consent could otherwise cite.
CREATE OR REPLACE FUNCTION participant_consent_session_is_own() RETURNS trigger AS $$
BEGIN
  IF NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM interview_sessions s
    WHERE s.id = NEW.session_id AND s.team_id = NEW.team_id
      AND s.study_id = NEW.study_id
      AND s.participant_id = NEW.participant_id
  ) THEN
    RAISE EXCEPTION 'a consent captured inside a session must name a session of the consenting participant';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consents_session_own
  AFTER INSERT ON participant_consents
  FOR EACH ROW EXECUTE FUNCTION participant_consent_session_is_own();

-- A grant records what the participant was actually shown. The composite key
-- proves the document belongs to the consent's own study; only a lookup can
-- prove the two things that make the record evidence rather than an assertion:
-- that the document was published — a draft is still being edited, and its
-- items are still moving — and that the copied hash is that document's own.
-- Without the second, the column accepts any well-formed digest, and a record
-- that cannot be tied back to the words it was taken against says nothing.
--
-- Once at insert is enough, because participant_consent_grant_immutable makes
-- both columns immutable afterwards. AFTER the row, so the hash CHECK and the
-- three keys report first.
CREATE OR REPLACE FUNCTION participant_consent_document_is_published() RETURNS trigger AS $$
DECLARE
  document_state text;
  document_hash text;
BEGIN
  SELECT d.state, d.content_hash INTO document_state, document_hash
  FROM consent_documents d
  WHERE d.id = NEW.consent_document_id AND d.team_id = NEW.team_id;
  IF document_state IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'a participant may only consent to a published document (%)', document_state;
  END IF;
  IF document_hash IS DISTINCT FROM NEW.consent_content_hash THEN
    RAISE EXCEPTION 'a consent record must copy its own document''s content hash';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consents_document_published
  AFTER INSERT ON participant_consents
  FOR EACH ROW EXECUTE FUNCTION participant_consent_document_is_published();

-- A grant with no affirmation of a required item is not consent, and a grant
-- that leaves any item unanswered is not the record of what the participant
-- saw: every item of the document — required affirmed, optional affirmed or
-- declined — has its response by the time the grant commits. The responses
-- are written after their consent inside the one transaction, so this can
-- only be asked at commit — hence a DEFERRABLE INITIALLY DEFERRED constraint
-- trigger, the only form that runs then. Completeness is also what fixes the
-- set: with every item answered, a response written later collides with the
-- primary key, so no later transaction can add an answer the participant
-- never gave. (Proving "the grant's own transaction" by the consent row's
-- `xmin` would not do it: a withdrawal updates that row, and the new tuple
-- looks freshly written.)
--
-- Deliberately not SECURITY DEFINER, for the reason network_rows_parent_is_writable
-- records: a definer function needs a pinned search_path, which breaks the
-- scratch-schema isolation the suites rely on. It therefore reads under the
-- committing transaction's own row visibility, which is the transaction that
-- wrote the grant everywhere except the seed — the one caller that re-stamps
-- the team GUC mid-transaction, and whose consents are written complete by
-- construction.
CREATE OR REPLACE FUNCTION participant_consent_required_items_are_affirmed() RETURNS trigger AS $$
DECLARE
  unanswered text;
  unaffirmed text;
BEGIN
  SELECT i.key INTO unanswered
  FROM consent_items i
  WHERE i.consent_document_id = NEW.consent_document_id
    AND i.team_id = NEW.team_id
    AND NOT EXISTS (
      SELECT 1 FROM participant_consent_item_responses r
      WHERE r.participant_consent_id = NEW.id AND r.consent_item_id = i.id
    )
  ORDER BY i.position
  LIMIT 1;
  IF unanswered IS NOT NULL THEN
    RAISE EXCEPTION 'a consent grant must answer every item of its document (%)', unanswered;
  END IF;
  SELECT i.key INTO unaffirmed
  FROM consent_items i
  WHERE i.consent_document_id = NEW.consent_document_id
    AND i.team_id = NEW.team_id
    AND i.required
    AND NOT EXISTS (
      SELECT 1 FROM participant_consent_item_responses r
      WHERE r.participant_consent_id = NEW.id
        AND r.consent_item_id = i.id
        AND r.affirmed
    )
  ORDER BY i.position
  LIMIT 1;
  IF unaffirmed IS NOT NULL THEN
    RAISE EXCEPTION 'a consent grant must affirm every required item of its document (%)', unaffirmed;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The one trigger here that cannot be CREATE OR REPLACEd: Postgres refuses
-- that form for a constraint trigger outright. DROP IF EXISTS first buys the
-- same idempotence, and a trigger cannot outlive the table it hangs off, so
-- there is nothing for the drop to leave behind either.
DROP TRIGGER IF EXISTS participant_consents_required_items_affirmed ON participant_consents;
CREATE CONSTRAINT TRIGGER participant_consents_required_items_affirmed
  AFTER INSERT ON participant_consents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION participant_consent_required_items_are_affirmed();

-- Deleting a consent record destroys the evidence that a participant agreed,
-- so the same two paths that may delete a session or a snapshot may delete
-- this, and nothing else may. The maintenance purge runs as
-- `studio_maintenance`; participant erasure runs as `studio_app`, the same role
-- as any buggy delete, and presents the transaction-scoped marker instead —
-- proven here against the row's own participant, so it authorizes erasing
-- exactly that participant's consent and no one else's.
CREATE OR REPLACE FUNCTION participant_consent_delete_is_audited() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF current_user = 'studio_maintenance'
     OR (marker IS NOT NULL AND marker = OLD.participant_id::text) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'participant consent grants are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consents_delete_audited
  BEFORE DELETE ON participant_consents
  FOR EACH ROW EXECUTE FUNCTION participant_consent_delete_is_audited();

-- The same rule for the responses, whose participant is their consent's. The
-- erasure deletes them before the grant they hang off, so the lookup still
-- finds it.
CREATE OR REPLACE FUNCTION participant_consent_response_delete_is_audited() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL AND EXISTS (
    SELECT 1 FROM participant_consents c
    WHERE c.id = OLD.participant_consent_id AND c.team_id = OLD.team_id
      AND c.participant_id::text = marker
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'participant consent responses are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participant_consent_item_responses_delete_audited
  BEFORE DELETE ON participant_consent_item_responses
  FOR EACH ROW EXECUTE FUNCTION participant_consent_response_delete_is_audited();
ALTER TABLE consent_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_items FORCE ROW LEVEL SECURITY;
ALTER TABLE participant_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE participant_consent_item_responses FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON consent_documents, consent_items, participant_consents, participant_consent_item_responses TO studio_app, studio_maintenance;


-- The fallback zone must be a zone Postgres knows, or every resolution for
-- a participant without a recorded zone fails at send time instead of at
-- configuration time. A CHECK cannot query pg_timezone_names; a trigger can.
--
-- Statement-level, with a transition table, rather than per row:
-- pg_timezone_names enumerates and evaluates the whole tz database on every
-- call (around four milliseconds), so a per-row probe made a resolver batch
-- of a thousand occurrences cost seconds. One outer join per statement
-- proves every row at the price of one enumeration. The converter
-- (`AT TIME ZONE`) would be a dictionary lookup, but it also accepts POSIX
-- offsets and bare abbreviations that are not IANA names, which is not the
-- contract.
CREATE OR REPLACE FUNCTION study_schedules_validate_time_zone() RETURNS trigger AS $$
DECLARE
  unknown_zone text;
BEGIN
  SELECT c.fallback_time_zone INTO unknown_zone
  FROM changed c
  LEFT JOIN pg_timezone_names n ON n.name = c.fallback_time_zone
  WHERE n.name IS NULL
  LIMIT 1;
  IF unknown_zone IS NOT NULL THEN
    RAISE EXCEPTION 'unknown IANA time zone: %', unknown_zone;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- A trigger may declare only one transition-table clause per event, so each
-- guarded table takes one per verb.
CREATE OR REPLACE TRIGGER study_schedules_time_zone_known_insert
  AFTER INSERT ON study_schedules REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION study_schedules_validate_time_zone();
CREATE OR REPLACE TRIGGER study_schedules_time_zone_known_update
  AFTER UPDATE ON study_schedules REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION study_schedules_validate_time_zone();

CREATE OR REPLACE FUNCTION schedule_occurrences_validate_time_zone() RETURNS trigger AS $$
DECLARE
  unknown_zone text;
BEGIN
  SELECT c.resolved_time_zone INTO unknown_zone
  FROM changed c
  LEFT JOIN pg_timezone_names n ON n.name = c.resolved_time_zone
  WHERE n.name IS NULL
  LIMIT 1;
  IF unknown_zone IS NOT NULL THEN
    RAISE EXCEPTION 'unknown IANA time zone: %', unknown_zone;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER schedule_occurrences_time_zone_known_insert
  AFTER INSERT ON schedule_occurrences REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION schedule_occurrences_validate_time_zone();
CREATE OR REPLACE TRIGGER schedule_occurrences_time_zone_known_update
  AFTER UPDATE ON schedule_occurrences REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION schedule_occurrences_validate_time_zone();

-- A resolved occurrence IS the draw: which schedule drew it, for whom, which
-- index of the run it is, and the participant-local date and minute it stands
-- for. Constrained random sampling is only meaningful if the draw stays drawn,
-- and a delivery pins its occurrence, so moving any of those afterwards would
-- reattribute a prompt the participant may already have been sent — silently,
-- because the row keeps its id. Only re-resolution and the lifecycle may write:
-- `scheduled_for`, `expires_at` and `resolved_time_zone` move when a
-- participant's zone changes or a DST transition shifts the same local intent
-- to another instant, and `state` moves as the occurrence is dispatched,
-- expires, is cancelled or is superseded. Same WHEN-clause shape as
-- message_delivery_payload_immutable: the trigger costs nothing on the updates
-- the dispatcher actually makes.
CREATE OR REPLACE FUNCTION schedule_occurrence_identity_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'schedule occurrence identity is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER schedule_occurrences_identity_immutable
  BEFORE UPDATE ON schedule_occurrences
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.study_id IS DISTINCT FROM OLD.study_id
    OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
    OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
    OR NEW.occurrence_index IS DISTINCT FROM OLD.occurrence_index
    OR NEW.scheduled_local_date IS DISTINCT FROM OLD.scheduled_local_date
    OR NEW.scheduled_local_minute IS DISTINCT FROM OLD.scheduled_local_minute
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION schedule_occurrence_identity_is_immutable();

-- A published template that has been sent is evidence: message_deliveries
-- pins it, and rewriting the body would misattribute what a participant
-- received.
CREATE OR REPLACE FUNCTION message_templates_publication_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published message templates are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_templates_publication_immutable
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  WHEN (
    OLD.state <> 'draft'
    AND (
      -- Publication is one-way: a published template retires, it does not
      -- go back to draft to be reworded and republished under the same id,
      -- and a retired one is not revived for message_deliveries_template_applies
      -- to accept again.
      NEW.state = 'draft'
      OR (OLD.state = 'retired' AND NEW.state IS DISTINCT FROM 'retired')
      -- The scope is part of what a delivery cites: moved to another study,
      -- the template would no longer apply where its deliveries went.
      OR NEW.study_id IS DISTINCT FROM OLD.study_id
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.body IS DISTINCT FROM OLD.body
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.channel IS DISTINCT FROM OLD.channel
      OR NEW.locale IS DISTINCT FROM OLD.locale
      OR NEW.version IS DISTINCT FROM OLD.version
    )
  )
  EXECUTE FUNCTION message_templates_publication_is_immutable();

-- The delivery's addressing and content identity are fixed at enqueue; only
-- dispatch state moves. Same shape as invitation_delivery_payload_immutable.
CREATE OR REPLACE FUNCTION message_delivery_payload_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'message delivery payload is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_delivery_payload_immutable
  BEFORE UPDATE ON message_deliveries
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.study_id IS DISTINCT FROM OLD.study_id
    OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
    OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.recipient_blind_index IS DISTINCT FROM OLD.recipient_blind_index
    OR NEW.rendered_body_hash IS DISTINCT FROM OLD.rendered_body_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION message_delivery_payload_is_immutable();

CREATE OR REPLACE TRIGGER message_delivery_events_immutable
  BEFORE UPDATE ON message_delivery_events
  FOR EACH ROW EXECUTE FUNCTION message_delivery_payload_is_immutable();

-- A delivery copies its template's kind and channel, and may cite a study
-- override only of its own study. The composite key cannot say "the
-- template's study is null or mine", so the three are proven here, once, at
-- enqueue: every one of them is immutable afterwards. AFTER the row, so the
-- kind and channel checks and the template key report first and this speaks
-- only to a well-formed delivery citing a real template of its team.
--
-- The state is proven with them. A draft is unreviewed wording and a retired
-- one has been withdrawn, so neither may be what a participant receives — and
-- without this clause a delivery could pin either, because the immutability
-- trigger above governs only what a published template may become, never which
-- template an enqueue is allowed to cite.
CREATE OR REPLACE FUNCTION message_delivery_template_applies() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM message_templates t
    WHERE t.id = NEW.template_id AND t.team_id = NEW.team_id
      AND t.kind = NEW.kind
      AND t.channel = NEW.channel
      AND t.state = 'published'
      AND (t.study_id IS NULL OR t.study_id = NEW.study_id)
  ) THEN
    RAISE EXCEPTION 'a delivery''s template must be a published % template for the % channel, either the team default or its own study''s override', NEW.kind, NEW.channel;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_deliveries_template_applies
  AFTER INSERT ON message_deliveries
  FOR EACH ROW EXECUTE FUNCTION message_delivery_template_applies();

-- A callback is evidence about one send, and the provider that made that send
-- is the only party that can have observed it. The delivery key proves the
-- event names a real delivery of its own team, and the provider CHECK proves
-- the name is one of the providers Studio uses; neither says the two agree, so
-- a bounce from a provider the delivery never went through would be recorded
-- against it and suppress a perfectly good address. A delivery with no
-- provider has not been attempted yet, so it can take no callbacks at all —
-- the equality is NULL there, and the row is refused. AFTER the row, so the
-- provider check, the identity key and the delivery key all report first.
CREATE OR REPLACE FUNCTION message_delivery_event_provider_sent_it() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM message_deliveries d
    WHERE d.id = NEW.delivery_id AND d.team_id = NEW.team_id
      AND d.provider = NEW.provider
  ) THEN
    RAISE EXCEPTION 'a delivery event must name the provider that sent its delivery';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_delivery_events_provider_sent_it
  AFTER INSERT ON message_delivery_events
  FOR EACH ROW EXECUTE FUNCTION message_delivery_event_provider_sent_it();

ALTER TABLE study_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_occurrences FORCE ROW LEVEL SECURITY;
ALTER TABLE message_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE message_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE message_delivery_events FORCE ROW LEVEL SECURITY;
ALTER TABLE participant_contact_optouts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON study_schedules, schedule_occurrences, message_templates, message_deliveries, message_delivery_events, participant_contact_optouts TO studio_app, studio_maintenance;

-- Commands enqueue inside their audited transaction; only the maintenance
-- dispatcher advances send state, exactly as for invitation delivery.
--
-- DELETE is NOT revoked, and must not be: the participant foreign key is NO
-- ACTION, so an erasure that cannot delete a participant's deliveries cannot
-- delete the participant either, and a participant who was ever messaged would
-- be unerasable. The privilege stays; the trigger below decides who may use
-- it, which is the finer instrument the erasure path needs — erasure runs as
-- `studio_app`, the same role as any buggy delete, so a role test alone
-- cannot tell the two apart.
REVOKE UPDATE ON message_deliveries FROM studio_app;
-- Provider callbacks are append-only evidence: a bounce or a complaint that
-- could be deleted, and its provider event id then reinserted, is no
-- evidence at all. The immutability trigger above refuses UPDATE for every
-- role; DELETE is left to the same two audited paths as the deliveries the
-- events describe, for the same reason.
REVOKE UPDATE ON message_delivery_events FROM studio_app;

-- Erasure deletes bottom-up, children first, because nothing here cascades:
--   message_delivery_events -> message_deliveries -> schedule_occurrences
-- so an event's delivery is still present when the event's marker is proven
-- through it.
--
-- The maintenance retention path runs as `studio_maintenance` and needs no
-- marker. Participant erasure presents the transaction-scoped marker instead,
-- and the marker is proven against the row's own participant, so it authorizes
-- deleting exactly that participant's outbox and nothing else — the same shape
-- `interview_sessions_are_writable` uses.
CREATE OR REPLACE FUNCTION message_deliveries_are_deletable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF current_user = 'studio_maintenance'
     OR (marker IS NOT NULL AND marker = OLD.participant_id::text) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'message deliveries are deleted only by an audited erasure or the maintenance retention path';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_deliveries_deletable
  BEFORE DELETE ON message_deliveries
  FOR EACH ROW EXECUTE FUNCTION message_deliveries_are_deletable();

-- An event carries no participant of its own, so the marker is proven through
-- the delivery it describes.
CREATE OR REPLACE FUNCTION message_delivery_events_are_deletable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL AND EXISTS (
    SELECT 1 FROM message_deliveries d
    WHERE d.id = OLD.delivery_id AND d.team_id = OLD.team_id
      AND d.participant_id::text = marker
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'message delivery events are deleted only by an audited erasure or the maintenance retention path';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_delivery_events_deletable
  BEFORE DELETE ON message_delivery_events
  FOR EACH ROW EXECUTE FUNCTION message_delivery_events_are_deletable();


-- A token's secret and authority are fixed at issue. Rotation is a new
-- token; widening scope is a new token. Only usage evidence, custodianship
-- and revocation move, and revocation is one-way.
CREATE OR REPLACE FUNCTION api_token_authority_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'api token authority is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER api_token_authority_immutable
  BEFORE UPDATE ON api_tokens
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.token_prefix IS DISTINCT FROM OLD.token_prefix
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
    OR NEW.study_id IS DISTINCT FROM OLD.study_id
    OR NEW.access_level IS DISTINCT FROM OLD.access_level
    OR NEW.includes_pii IS DISTINCT FROM OLD.includes_pii
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    -- Revocation is evidence of who withdrew the token's authority and when,
    -- so both columns freeze together. Freezing only the timestamp would leave
    -- the accountable name rewritable on an already-revoked token, and
    -- api_tokens_revocation_check keeps the pair non-null, so it could be
    -- reassigned to anyone.
    OR (
      OLD.revoked_at IS NOT NULL
      AND (
        NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
        OR NEW.revoked_by_user_id IS DISTINCT FROM OLD.revoked_by_user_id
      )
    )
  )
  EXECUTE FUNCTION api_token_authority_is_immutable();
ALTER TABLE api_tokens FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON api_tokens TO studio_app, studio_maintenance;


CREATE OR REPLACE FUNCTION template_versions_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published template versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER template_versions_immutable
  BEFORE UPDATE OR DELETE ON template_versions
  FOR EACH ROW EXECUTE FUNCTION template_versions_are_immutable();

CREATE OR REPLACE TRIGGER template_version_sections_immutable
  BEFORE UPDATE OR DELETE ON template_version_sections
  FOR EACH ROW EXECUTE FUNCTION template_versions_are_immutable();

-- Adding a pin after publication would change what the version resolves to
-- while its frozen manifest and hash stayed unchanged (version_sections).
CREATE OR REPLACE FUNCTION template_version_sections_pins_are_frozen() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM template_versions v
    WHERE v.id = NEW.version_id AND v.xmin = pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'published template versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER template_version_sections_insert_frozen
  BEFORE INSERT ON template_version_sections
  FOR EACH ROW EXECUTE FUNCTION template_version_sections_pins_are_frozen();
ALTER TABLE templates FORCE ROW LEVEL SECURITY;
ALTER TABLE template_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE template_version_sections FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON templates, template_versions, template_version_sections TO studio_app, studio_maintenance;


CREATE OR REPLACE FUNCTION webhook_delivery_payload_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'webhook delivery payload is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER webhook_delivery_payload_immutable
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
    OR NEW.webhook_id IS DISTINCT FROM OLD.webhook_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION webhook_delivery_payload_is_immutable();

-- The composite key proves the subscription is the team's. It cannot prove
-- the subscription still wants the delivery, and both halves of that matter:
-- a disabled endpoint is one the retry policy gave up on, and an event type
-- outside the subscriber's filter is one they never asked for. A payload is
-- thin, but it is still a team's resource ids leaving the instance, so
-- queuing either is an egress the subscriber did not consent to — and the
-- payload trigger above then freezes it in place.
--
-- AFTER the row, so the length and payload checks and the subscription key
-- report first and this speaks only to a well-formed delivery addressed to a
-- real subscription of its own team.
CREATE OR REPLACE FUNCTION webhook_delivery_subscription_wants_event() RETURNS trigger AS $$
DECLARE
  subscription_state text;
  subscribed_types text[];
BEGIN
  SELECT s.state, s.event_types INTO subscription_state, subscribed_types
  FROM webhook_subscriptions s
  WHERE s.id = NEW.subscription_id AND s.team_id = NEW.team_id;

  IF subscription_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'a webhook delivery may only be queued for an active subscription';
  END IF;
  -- IS NOT TRUE, so an unknown (a null element in the filter) is refused
  -- like a miss rather than slipping past a NOT that never becomes true.
  IF (NEW.event_type = ANY(subscribed_types)) IS NOT TRUE THEN
    RAISE EXCEPTION 'the subscription does not ask for % events', NEW.event_type;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER webhook_deliveries_subscription_wants_event
  AFTER INSERT ON webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION webhook_delivery_subscription_wants_event();

ALTER TABLE webhook_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_subscriptions, webhook_deliveries TO studio_app, studio_maintenance;

-- Commands enqueue a delivery inside their audited transaction; only the
-- maintenance dispatcher advances its state. The revocation binds only where
-- this sidecar runs after db/access.ts's blanket grant over ALL TABLES, which
-- is where team_invitation_deliveries' matching revocation sits; the payload
-- trigger above holds for every role regardless.
REVOKE UPDATE, DELETE ON webhook_deliveries FROM studio_app;


-- An assignment is the basis of every analysis that cites it. Re-rolling a
-- subject's variant mid-experiment invalidates the result silently.
CREATE OR REPLACE FUNCTION experiment_assignments_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'experiment assignments are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_immutable
  BEFORE UPDATE ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_are_immutable();

CREATE OR REPLACE TRIGGER experiment_exposures_immutable
  BEFORE UPDATE ON experiment_exposures
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_are_immutable();

-- Immutability that stopped at UPDATE would not be immutability. The blanket
-- tenant grant includes DELETE, so code running as studio_app could
-- delete a subject's exposures, delete the assignment they proved, and insert
-- a new one on another arm — re-rolling a sticky assignment through the one
-- verb the triggers above leave open, and invalidating every analysis that
-- cites it. Two delete paths are exempt, and only two: the maintenance purge,
-- and the audited participant erasure, which runs as studio_app too
-- and so presents the transaction-scoped marker instead. The marker is proven
-- against the row's own subject, so it authorizes deleting exactly one
-- participant's assignments and nothing else.
--
-- A subject of any other kind is never erasable: a researcher's assignment
-- (`user`) and an anonymous visitor's (`session`) belong to no participant,
-- so no marker can name them.
CREATE OR REPLACE FUNCTION experiment_assignments_are_deletable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL
     AND OLD.subject_kind = 'participant'
     AND OLD.subject_id = marker THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'experiment assignments are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_deletable
  BEFORE DELETE ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_are_deletable();

-- The same promise for the exposures, proven through the assignment they
-- were logged against: an exposure carries no subject of its own, and erasure
-- must remove them before the assignment, because the composite key holds the
-- assignment in place while any of its exposures survive.
CREATE OR REPLACE FUNCTION experiment_exposures_are_deletable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('app.erasing_participant_id', true), '');
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL AND EXISTS (
    SELECT 1 FROM experiment_assignments a
    WHERE a.id = OLD.assignment_id AND a.team_id = OLD.team_id
      AND a.subject_kind = 'participant'
      AND a.subject_id = marker
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'experiment exposures are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_exposures_deletable
  BEFORE DELETE ON experiment_exposures
  FOR EACH ROW EXECUTE FUNCTION experiment_exposures_are_deletable();

-- An assignment's arm must be one the experiment defines: the variants array
-- is shape-checked, and nothing else would tie `variant_key` to it. AFTER
-- the row, so the key's own shape check and the experiment key report first
-- and this speaks only to a well-formed row of a real experiment.
CREATE OR REPLACE FUNCTION experiment_assignments_variant_is_known() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM experiments e
    CROSS JOIN LATERAL jsonb_array_elements(e.variants) AS variant
    WHERE e.id = NEW.experiment_id AND e.team_id = NEW.team_id
      AND variant->>'key' = NEW.variant_key
  ) THEN
    RAISE EXCEPTION 'variant % is not one of the experiment''s variants', NEW.variant_key;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_variant_known
  AFTER INSERT ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_variant_is_known();

-- ...and the definition holds still once subjects are being assigned against
-- it: an arm renamed or removed under a running experiment would orphan the
-- assignments the check above admitted.
-- An assignment or exposure belongs to the experiment's lifetime: it needs
-- an experiment that has started, and a moment between that start and the
-- stop, if there has been one. Outside that span the row would be immutable
-- evidence an analysis by experiment and arm could not tell from the real
-- observations. AFTER the row, so the composite keys report first.
CREATE OR REPLACE FUNCTION experiment_rows_are_within_lifetime() RETURNS trigger AS $$
DECLARE
  started timestamptz;
  stopped timestamptz;
  moment timestamptz;
BEGIN
  SELECT e.started_at, e.stopped_at INTO started, stopped
  FROM experiments e WHERE e.id = NEW.experiment_id AND e.team_id = NEW.team_id;
  -- The row's own moment, named per table by the trigger's second argument:
  -- a direct NEW.<column> would bind both names against each record.
  moment := (to_jsonb(NEW) ->> TG_ARGV[1])::timestamptz;
  IF started IS NULL THEN
    RAISE EXCEPTION 'an experiment that has not started has no %', TG_ARGV[0];
  END IF;
  IF moment < started OR (stopped IS NOT NULL AND moment > stopped) THEN
    RAISE EXCEPTION 'an experiment''s % lie within its lifetime', TG_ARGV[0];
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_within_lifetime
  AFTER INSERT ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_rows_are_within_lifetime('assignments', 'assigned_at');

CREATE OR REPLACE TRIGGER experiment_exposures_within_lifetime
  AFTER INSERT ON experiment_exposures
  FOR EACH ROW EXECUTE FUNCTION experiment_rows_are_within_lifetime('exposures', 'occurred_at');

CREATE OR REPLACE FUNCTION experiment_variants_are_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'the variants of an experiment that has started are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_variants_frozen
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  WHEN (OLD.state <> 'draft' AND NEW.variants IS DISTINCT FROM OLD.variants)
  EXECUTE FUNCTION experiment_variants_are_frozen();

-- ...which only holds if "started" cannot be undone. The state check ties a
-- draft to a null `started_at`, so a row could be walked back to draft with
-- its start cleared and its variants then rewritten under the assignments
-- and exposures that cite the old arms. The first start is therefore final:
-- once recorded it neither clears nor moves, and the state never returns to
-- draft.
CREATE OR REPLACE FUNCTION experiment_start_is_final() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'an experiment that has started cannot return to draft or move its start';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_start_final
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  WHEN (
    OLD.started_at IS NOT NULL
    AND (NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.state = 'draft')
  )
  EXECUTE FUNCTION experiment_start_is_final();

-- The stop closes the lifetime the rows above were admitted into, so it
-- cannot land before any of them: the lifetime triggers run only when an
-- assignment or exposure is inserted, and would not notice a stop that
-- moved underneath rows they had already accepted. And like the start, the
-- stop is final — moved or lifted, it would reopen a lifetime whose
-- observations an analysis has already read as complete.
CREATE OR REPLACE FUNCTION experiment_stop_closes_the_lifetime() RETURNS trigger AS $$
BEGIN
  IF OLD.stopped_at IS NOT NULL THEN
    RAISE EXCEPTION 'an experiment that has stopped cannot resume or move its stop';
  END IF;
  IF EXISTS (
    SELECT 1 FROM experiment_assignments a
    WHERE a.experiment_id = NEW.id AND a.team_id = NEW.team_id
      AND a.assigned_at > NEW.stopped_at
  ) OR EXISTS (
    SELECT 1 FROM experiment_exposures x
    WHERE x.experiment_id = NEW.id AND x.team_id = NEW.team_id
      AND x.occurred_at > NEW.stopped_at
  ) THEN
    RAISE EXCEPTION 'an experiment cannot stop before its assignments and exposures';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_stop_closes_lifetime
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  WHEN (NEW.stopped_at IS DISTINCT FROM OLD.stopped_at)
  EXECUTE FUNCTION experiment_stop_closes_the_lifetime();

-- Both of the guards above read the variant list as a list of arms, and
-- `experiments_variants_check` cannot make it one: bounding the array and its
-- length is all a CHECK can do here, so on its own it admits [null, null], two
-- arms under one key, and weights of zero or less. Each is a silent corruption
-- of the randomiser that reads them — a null arm has no key to assign,
-- duplicate keys make two arms indistinguishable in every analysis, and a
-- non-positive weight either removes an arm the design says exists or makes
-- the weighted draw meaningless. The elements are proven in a trigger rather
-- than the CHECK because drizzle creates the table, and its constraints,
-- before this sidecar defines any function a CHECK could call.
--
-- BEFORE the row, because it decides whether the row may exist at all, and it
-- returns early on a non-array so `experiments_variants_check` still reports
-- the container's own shape instead of being masked by an element error.
-- Triggers fire in name order, so on an UPDATE `experiments_variants_frozen`
-- has already refused a started experiment before this one reads anything.
CREATE OR REPLACE FUNCTION experiment_variants_are_well_formed() RETURNS trigger AS $$
DECLARE
  variant jsonb;
  variant_key text;
  seen text[] := ARRAY[]::text[];
  weight numeric;
BEGIN
  IF jsonb_typeof(NEW.variants) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR variant IN SELECT jsonb_array_elements(NEW.variants) LOOP
    IF jsonb_typeof(variant) <> 'object' THEN
      RAISE EXCEPTION 'every experiment variant must be an object carrying a key and a weight';
    END IF;

    variant_key := variant->>'key';
    -- The same shape `experiment_assignments_lengths_check` demands of the
    -- `variant_key` that has to match one of these.
    IF coalesce(variant_key, '') !~ '^[a-z][a-z0-9_.-]{0,63}$' THEN
      RAISE EXCEPTION 'the experiment variant key % is not a well-formed key', coalesce(variant_key, '(missing)');
    END IF;
    IF variant_key = ANY(seen) THEN
      RAISE EXCEPTION 'the experiment variant key % is used twice', variant_key;
    END IF;
    seen := seen || variant_key;

    -- IS DISTINCT FROM, not <>: a missing weight makes jsonb_typeof NULL, and
    -- plpgsql treats a NULL condition as false, so <> would let it through.
    IF jsonb_typeof(variant->'weight') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'the experiment variant % must carry a positive integer weight', variant_key;
    END IF;
    weight := (variant->>'weight')::numeric;
    IF weight <= 0 OR weight <> trunc(weight) THEN
      RAISE EXCEPTION 'the experiment variant % must carry a positive integer weight', variant_key;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_variants_well_formed
  BEFORE INSERT OR UPDATE ON experiments
  FOR EACH ROW EXECUTE FUNCTION experiment_variants_are_well_formed();

ALTER TABLE experiments FORCE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE experiment_exposures FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON experiments, experiment_assignments, experiment_exposures TO studio_app, studio_maintenance;


ALTER TABLE feedback_reports FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback_reports TO studio_app, studio_maintenance;


ALTER TABLE study_wave_rollups FORCE ROW LEVEL SECURITY;
ALTER TABLE study_stage_rollups FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON study_wave_rollups, study_stage_rollups TO studio_app, studio_maintenance;


CREATE OR REPLACE FUNCTION invitation_delivery_payload_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invitation delivery payload is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER invitation_delivery_payload_immutable
  BEFORE UPDATE ON team_invitation_deliveries
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.team_label IS DISTINCT FROM OLD.team_label
    OR NEW.inviter_label IS DISTINCT FROM OLD.inviter_label
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION invitation_delivery_payload_is_immutable();

ALTER TABLE team_invitation_deliveries FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_invitation_deliveries TO studio_app, studio_maintenance;

-- Commands may enqueue inside their audited transaction, but only the
-- maintenance dispatcher can advance delivery state. The trigger keeps the
-- snapshotted recipient, role, labels, invitation, and expiry immutable even
-- for that cross-team role and privileged connections.
REVOKE UPDATE, DELETE ON team_invitation_deliveries FROM studio_app;


CREATE OR REPLACE FUNCTION audit_events_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_are_immutable();

-- An export request is a promise about what will be generated: its filters,
-- high-water mark, budgets and preflight result are the contract the
-- completion event is checked against, so no worker may edit them.
CREATE OR REPLACE FUNCTION audit_export_request_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit export request is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_export_request_immutable
  BEFORE UPDATE ON audit_export_jobs
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.actor_kind IS DISTINCT FROM OLD.actor_kind
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.start_event_id IS DISTINCT FROM OLD.start_event_id
    OR NEW.start_event_sequence IS DISTINCT FROM OLD.start_event_sequence
    OR NEW.high_water_sequence IS DISTINCT FROM OLD.high_water_sequence
    OR NEW.filters IS DISTINCT FROM OLD.filters
    OR NEW.row_limit IS DISTINCT FROM OLD.row_limit
    OR NEW.byte_limit IS DISTINCT FROM OLD.byte_limit
    OR NEW.preflight_row_count IS DISTINCT FROM OLD.preflight_row_count
    OR NEW.preflight_byte_count IS DISTINCT FROM OLD.preflight_byte_count
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION audit_export_request_is_immutable();

-- A handle is single-use: once consumed it can never be un-consumed, and a
-- consumed or expired handle can never be re-issued on the same row.
CREATE OR REPLACE FUNCTION audit_export_handle_is_single_use() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit export handle is single use';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_export_handle_single_use
  BEFORE UPDATE ON audit_export_jobs
  FOR EACH ROW
  WHEN (
    (OLD.handle_consumed_at IS NOT NULL AND NEW.handle_consumed_at IS DISTINCT FROM OLD.handle_consumed_at)
    OR (OLD.handle_hash IS NOT NULL AND NEW.handle_hash IS DISTINCT FROM OLD.handle_hash)
  )
  EXECUTE FUNCTION audit_export_handle_is_single_use();

-- The alert outbox's link to its immutable event, and the reason it exists,
-- are fixed at insert; only delivery state moves.
CREATE OR REPLACE FUNCTION audit_alert_link_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit alert link is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_alert_link_immutable
  BEFORE UPDATE ON audit_alert_outbox
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id
    OR NEW.audit_event_sequence IS DISTINCT FROM OLD.audit_event_sequence
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.event_version IS DISTINCT FROM OLD.event_version
    OR NEW.alert_policy_key IS DISTINCT FROM OLD.alert_policy_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION audit_alert_link_is_immutable();

ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_export_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_alert_outbox FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_events, audit_export_jobs, audit_alert_outbox TO studio_app, studio_maintenance;

-- Commands enqueue inside their audited transaction; only the maintenance
-- worker advances generation and delivery state. DELETE stays with
-- studio_maintenance on both: terminal outbox rows and expired jobs
-- are swept on a retention window, and the artifact object is deleted with the
-- row. The one exception is consuming a download handle, which happens on the
-- app-served download GET and is admitted as a column-level grant rather than
-- table-level UPDATE. One statement per table so both are documented.
REVOKE UPDATE, DELETE ON audit_export_jobs FROM studio_app;
REVOKE UPDATE, DELETE ON audit_alert_outbox FROM studio_app;
GRANT UPDATE (handle_consumed_at) ON audit_export_jobs TO studio_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events
  FROM studio_app, studio_maintenance;

