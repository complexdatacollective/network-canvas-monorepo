import { it } from 'vitest';

/**
 * Scaffolding for the layout engine's rebuild on the rule set
 * (rules-audit.md section 1, with Josh's Round 4 rulings): the tests of the
 * hard constraints the engine does not meet yet. Each is expected to fail
 * until the stage of the rebuild that meets it lands, and is then taken off
 * this list; the list, and this module, go once the rebuild is complete.
 */
const PENDING = new Set<string>([
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
