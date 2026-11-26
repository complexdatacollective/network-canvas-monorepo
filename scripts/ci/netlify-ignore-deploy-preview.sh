#!/usr/bin/env bash
# Netlify deploy-preview ignore command, shared by every site in this
# repository. Netlify skips the build when this exits 0 and builds it when it
# exits 1.
#
# Usage, from any directory inside the repository:
#   bash scripts/ci/netlify-ignore-deploy-preview.sh \
#     --config apps/<app>/netlify.toml [--tasks build] -- <package>...
#
# A preview is skipped only when both of these are true:
#
#   1. The pull request does not affect the site. Its changes are measured
#      from the commit where it left main. Comparing with the previous
#      preview alone is not enough: a release branch is regenerated on the
#      newest main every time something merges, and a pull request can merge
#      main into itself, so everything merged in between would count as the
#      pull request's own change.
#   2. The site's existing preview is still correct. Either nothing that
#      affects the site changed since the site's last build for this pull
#      request (Netlify's CACHED_COMMIT_REF), or the pull request does not
#      affect the site and the last built commit's own changes did not either.
#      A preview that shows a change the pull request has since reverted is
#      rebuilt.
#
# A change to the site's netlify.toml or to the root package.json,
# pnpm-lock.yaml or pnpm-workspace.yaml counts as affecting every site, as
# turbo does not report those. Any step that cannot answer (no main history, a
# failed fetch, turbo failing) builds the preview.

set -u

config=""
tasks=()
packages=()
while (($# > 0)); do
  case "$1" in
    --config)
      config="$2"
      shift 2
      ;;
    --tasks)
      tasks=(--tasks "$2")
      shift 2
      ;;
    --)
      shift
      packages=("$@")
      break
      ;;
    *)
      echo "netlify-ignore: unknown argument $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$config" || ${#packages[@]} -eq 0 ]]; then
  echo "netlify-ignore: --config and at least one package are required; building." >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)" || exit 1
cd "$root" || exit 1

head="${COMMIT_REF:-}"
if [[ -z "$head" ]]; then
  echo "netlify-ignore: COMMIT_REF is not set; building."
  exit 1
fi

turbo_version="$(node -p "require('./package.json').devDependencies.turbo")" || exit 1
global_inputs=("$config" package.json pnpm-lock.yaml pnpm-workspace.yaml)

# Exit status 0 when nothing between $1 and $2 affects the packages, 1 when
# something does or the question cannot be answered.
unaffected_since_for() {
  local base="$1" tip="$2"
  if ! git diff --quiet "$base" "$tip" -- "${global_inputs[@]}"; then
    echo "netlify-ignore: a file that affects every site changed in $base..$tip."
    return 1
  fi
  npx --yes "turbo@${turbo_version}" query affected ${tasks[@]+"${tasks[@]}"} \
    --packages "${packages[@]}" --base "$base" --head "$tip" --exit-code
}

unaffected_since() {
  unaffected_since_for "$1" "$head"
}

# The commit where the pull request left main. A pull request into another
# branch is measured from main as well, which can only build more previews.
main_ref=refs/remotes/netlify-ignore/main
if ! git fetch --quiet --no-tags origin "+refs/heads/main:${main_ref}" 2>/dev/null \
  && ! git fetch --quiet --no-tags \
    https://github.com/complexdatacollective/network-canvas-monorepo.git \
    "+refs/heads/main:${main_ref}"; then
  echo "netlify-ignore: could not fetch main; building."
  exit 1
fi
if ! fork_point="$(git merge-base "$main_ref" "$head")"; then
  echo "netlify-ignore: $head shares no history with main; building."
  exit 1
fi

cached="${CACHED_COMMIT_REF:-}"

if unaffected_since "$fork_point"; then
  # The existing preview may still show a change this pull request has since
  # reverted. It needs rebuilding when the last built commit's own changes,
  # measured from where that commit left main, affected the site.
  if [[ -n "$cached" && "$cached" != "$head" ]]; then
    if ! git cat-file -e "${cached}^{commit}" 2>/dev/null \
      || ! cached_fork_point="$(git merge-base "$main_ref" "$cached")"; then
      echo "netlify-ignore: cannot tell what the last built commit $cached changed; building."
      exit 1
    fi
    if ! unaffected_since_for "$cached_fork_point" "$cached"; then
      echo "netlify-ignore: the last preview (${cached:0:10}) shows a change this pull request no longer makes; building."
      exit 1
    fi
  fi
  echo "netlify-ignore: this pull request (${fork_point:0:10}..${head:0:10}) does not affect ${packages[*]}; skipping."
  exit 0
fi

if [[ -z "$cached" || "$cached" == "$head" ]]; then
  echo "netlify-ignore: no earlier build of this pull request to compare with; building."
  exit 1
fi
if ! git cat-file -e "${cached}^{commit}" 2>/dev/null; then
  echo "netlify-ignore: the last built commit $cached is not in the clone; building."
  exit 1
fi
if unaffected_since "$cached"; then
  echo "netlify-ignore: nothing affecting ${packages[*]} changed since ${cached:0:10}; skipping."
  exit 0
fi

exit 1
