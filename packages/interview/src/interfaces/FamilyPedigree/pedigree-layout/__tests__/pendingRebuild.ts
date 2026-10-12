import { it } from 'vitest';

/**
 * The hard-constraint tests the rule set (rules-audit.md section 1, with
 * Josh's Round 4 rulings) cannot meet without a scenario-specific exception.
 * The rebuild met every other one. Each family here is a contradiction
 * between two rulings, reported on PR #2172 for a ruling rather than built
 * around: the seat cost's straight-line estimate against the router's one
 * row gap (the donor who raises another child), donors' junctions crowding
 * the bar a raising line must cross (the egg donor, sperm donor and
 * surrogate for two of three children), three helpers with one owner and
 * two adjacent seats (the three donors), and end spacing against line
 * clearance at a child several owners reach from one side (the step and
 * adoptive parents who separated, drawn as the six-parent family). Each is
 * expected to fail until its ruling lands; the list, and this module, go
 * with the last one.
 */
const PENDING = new Set<string>([
  'hops: step parents and adoptive parents who separated (circles)',
  'seats a donor who raises another child where their lines cross least, recorded ego, ruby, theo (87px symbols)',
  'seats a donor who raises another child where their lines cross least, recorded ego, ruby, theo (96px symbols)',
  'seats a donor who raises another child where their lines cross least, recorded theo, ego, ruby (87px symbols)',
  'seats a donor who raises another child where their lines cross least, recorded theo, ego, ruby (96px symbols)',
  'an egg donor, a sperm donor and a surrogate for two of three children Hannah raises (circles)',
  'an egg donor, a sperm donor and a surrogate for two of three children Hannah raises (squares)',
  'passes the strict line checks (all squares, 87px symbols)',
  'passes the strict line checks (all squares, 96px symbols)',
  'passes the strict line checks (mixed shapes, 87px symbols)',
  'passes the strict line checks (mixed shapes, 96px symbols)',
  'passes the strict line checks: a donor to two children who raises the third, recorded ego, ruby, theo (87px symbols)',
  'passes the strict line checks: a donor to two children who raises the third, recorded ego, ruby, theo (96px symbols)',
  'passes the strict line checks: a donor to two children who raises the third, recorded theo, ego, ruby (87px symbols)',
  'passes the strict line checks: a donor to two children who raises the third, recorded theo, ego, ruby (96px symbols)',
  'passes the strict line checks: an egg donor, a sperm donor and a surrogate for two of three children (all squares, 87px symbols)',
  'passes the strict line checks: an egg donor, a sperm donor and a surrogate for two of three children (all squares, 96px symbols)',
  'passes the strict line checks: an egg donor, a sperm donor and a surrogate for two of three children (mixed shapes, 87px symbols)',
  'passes the strict line checks: an egg donor, a sperm donor and a surrogate for two of three children (mixed shapes, 96px symbols)',
  'passes the strict line checks: three donors to three runs of a sibship (all squares, 87px symbols)',
  'passes the strict line checks: three donors to three runs of a sibship (all squares, 96px symbols)',
  'passes the strict line checks: three donors to three runs of a sibship (mixed shapes, 87px symbols)',
  'passes the strict line checks: three donors to three runs of a sibship (mixed shapes, 96px symbols)',
  'step parents and adoptive parents who separated (circles)',
  'step parents and adoptive parents who separated (squares)',
]);

/** A test, expected to fail while it is pending. */
export function check(title: string, test: () => void) {
  (PENDING.has(title) ? it.fails : it)(title, test);
}
