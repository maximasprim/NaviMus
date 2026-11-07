import type { Database } from "../../client.js";
import { seedCatalog } from "./catalog.js";
import { seedCommerce } from "./commerce.js";
import { seedEngagement } from "./engagement.js";
import { EXTRA_PASSWORDS, seedPeople } from "./people.js";

export { EXTRA_PASSWORDS };

/**
 * Expanded demo dataset for manual QA. Runs after the base seed (roles, plans, the two base tenants, the four
 * headline accounts and one demo package each) and builds on those rows rather than replacing them.
 *
 * Dev/CI only. Never run against a production database.
 */
export async function seedDemoData(db: Database) {
  console.log("Seeding expanded demo data...");
  const refs = await seedCatalog(db);
  const people = await seedPeople(db, refs);
  const commerce = await seedCommerce(db, refs, people);
  await seedEngagement(db, refs, people, commerce);

  const count = (cat: typeof refs.default) => ({ operators: cat.operators.size, destinations: cat.destinations.size, packages: cat.packages.size, accommodations: cat.accommodations.size });
  return {
    default: count(refs.default),
    enroute: count(refs.enroute),
    customers: people.customers.default.length + people.customers.enroute.length,
    staff: people.staff.size,
    bookings: commerce.bookings.length,
    reviews: commerce.reviewIds.length,
  };
}
