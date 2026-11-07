/**
 * Pure data for the expanded demo catalog. No database access in this file -
 * catalog.ts turns these specs into rows. All names are fictional demo content.
 */

export type PolicyKind = "flexible" | "moderate" | "strict";

export const POLICY_TEMPLATES: Record<PolicyKind, { name: string; rules: Array<[number, number | null, number, number]> }> = {
  // [daysBeforeMin, daysBeforeMax (null = unbounded), refund %, penalty %]
  flexible: { name: "Flexible", rules: [[30, null, 100, 0], [14, 29, 75, 25], [7, 13, 50, 50], [0, 6, 0, 100]] },
  moderate: { name: "Moderate", rules: [[45, null, 100, 0], [21, 44, 70, 30], [7, 20, 40, 60], [0, 6, 0, 100]] },
  strict: { name: "Strict (peak season)", rules: [[60, null, 90, 10], [30, 59, 50, 50], [0, 29, 0, 100]] },
};

// ---------------------------------------------------------------- geography

/** [country iso, region name] pairs that may not exist yet. */
export const EXTRA_REGIONS: Array<[string, string]> = [
  ["KE", "Central"], ["KE", "Nyanza"], ["TZ", "Dar es Salaam"], ["RW", "Kigali"], ["RW", "Northern"],
  ["UG", "Central"], ["UG", "Western"], ["ZA", "Western Cape"], ["AE", "Dubai"], ["EG", "Cairo"],
];

/** [region key "ISO:Region", city name, lat, lng] */
export const EXTRA_CITIES: Array<[string, string, number, number]> = [
  ["KE:Coast", "Mombasa", -4.0435, 39.6682],
  ["KE:Coast", "Lamu", -2.2717, 40.902],
  ["KE:Coast", "Watamu", -3.354, 40.024],
  ["KE:Coast", "Voi (Tsavo)", -3.396, 38.556],
  ["KE:Rift Valley", "Nakuru", -0.3031, 36.08],
  ["KE:Rift Valley", "Amboseli", -2.6527, 37.2606],
  ["KE:Rift Valley", "Samburu", 0.615, 37.53],
  ["KE:Central", "Nanyuki (Mount Kenya)", 0.0167, 37.074],
  ["KE:Nyanza", "Kisumu", -0.0917, 34.768],
  ["TZ:Arusha", "Ngorongoro", -3.1618, 35.5877],
  ["TZ:Zanzibar", "Nungwi", -5.7253, 39.2987],
  ["RW:Kigali", "Kigali", -1.9441, 30.0619],
  ["RW:Northern", "Musanze (Volcanoes)", -1.499, 29.634],
  ["UG:Central", "Kampala", 0.3476, 32.5825],
  ["UG:Western", "Bwindi", -1.065, 29.7],
  ["ZA:Western Cape", "Cape Town", -33.9249, 18.4241],
  ["AE:Dubai", "Dubai", 25.2048, 55.2708],
  ["EG:Cairo", "Cairo", 30.0444, 31.2357],
];

// ------------------------------------------------------------ destinations

export interface DestSpec {
  slug: string;
  name: string;
  category: string; // destination category slug
  city: string;
  short: string;
  description: string;
  bestTime: string;
  featured?: boolean;
  status?: "published" | "draft";
  amenities: string[];
  activities: Array<[string, string]>;
  minimumAge?: number;
  capacity?: number;
  hours?: number;
}

export const DEFAULT_DESTINATIONS: DestSpec[] = [
  {
    slug: "amboseli-national-park", name: "Amboseli National Park", category: "wildlife-nature", city: "Amboseli",
    short: "Big elephant herds beneath the snows of Mount Kilimanjaro.",
    description: "Amboseli is famous for large elephant herds and uninterrupted views of Kilimanjaro. Seasonal swamps draw buffalo, hippo and over 400 bird species. Demo content - replace with real editorial copy.",
    bestTime: "June to October and January to February", featured: true,
    amenities: ["Park gate", "Viewing platforms", "Picnic sites"],
    activities: [["Elephant game drive", "Dawn and dusk drives around Ol Tukai swamp."], ["Observation Hill walk", "Panoramic views of the park and Kilimanjaro."], ["Maasai cultural visit", "Meet a nearby Maasai community."]],
  },
  {
    slug: "lake-nakuru-national-park", name: "Lake Nakuru National Park", category: "wildlife-nature", city: "Nakuru",
    short: "A rhino sanctuary around a soda lake, with flamingos on the shore.",
    description: "A compact park with both white and black rhino, Rothschild's giraffe and a rich birdlife. Demo content - replace with real editorial copy.",
    bestTime: "June to March", featured: true,
    amenities: ["Park gate", "Baboon Cliff viewpoint", "Picnic sites"],
    activities: [["Rhino tracking drive", "Search for both rhino species."], ["Birdwatching", "Flamingos, pelicans and more."], ["Baboon Cliff sunset", "Elevated viewpoint over the lake."]],
  },
  {
    slug: "samburu-national-reserve", name: "Samburu National Reserve", category: "wildlife-nature", city: "Samburu",
    short: "Dry-country wildlife along the Ewaso Ng'iro river.",
    description: "Home to the 'Samburu Special Five': Grevy's zebra, reticulated giraffe, Somali ostrich, gerenuk and beisa oryx. Demo content - replace with real editorial copy.",
    bestTime: "June to October and December to March",
    amenities: ["Riverside picnic sites", "Park gate"],
    activities: [["Special Five game drive", "Target the five northern specialities."], ["Samburu village visit", "Beadwork and dance with a local community."]],
  },
  {
    slug: "tsavo-east-west", name: "Tsavo East & West", category: "wildlife-nature", city: "Voi (Tsavo)",
    short: "Kenya's largest park system - red elephants and vast plains.",
    description: "Tsavo's red-dust elephants, Mzima Springs and Lugard Falls make it a classic safari. Demo content - replace with real editorial copy.",
    bestTime: "June to October and January to February",
    amenities: ["Park gates", "Mzima Springs trail"],
    activities: [["Red elephant game drive", "Photograph the famous red-dust herds."], ["Mzima Springs", "Crystal-clear springs with hippo and crocodile."]],
  },
  {
    slug: "nairobi-national-park", name: "Nairobi National Park", category: "wildlife-nature", city: "Nairobi",
    short: "Lions and rhino with the city skyline in the background.",
    description: "The world's only wildlife park bordering a capital city - ideal for a half-day safari. Demo content - replace with real editorial copy.",
    bestTime: "Year-round, best June to October", featured: true,
    amenities: ["Park gate", "Walking trail", "Ivory Burning Site monument"],
    activities: [["Half-day game drive", "Morning or afternoon drive."], ["Giraffe Centre visit", "Feed Rothschild's giraffes."], ["Elephant orphanage visit", "Meet orphaned elephants at feeding time."]],
  },
  {
    slug: "mount-kenya", name: "Mount Kenya", category: "adventure", city: "Nanyuki (Mount Kenya)",
    short: "Africa's second-highest peak - alpine trekking on the equator.",
    description: "Trek through bamboo forest and moorland to Point Lenana at 4,985 m. Demo content - replace with real editorial copy.",
    bestTime: "January to February and August to September",
    amenities: ["Mountain huts", "Park gate", "Porter service"], minimumAge: 14,
    activities: [["Sirimon route trek", "Classic acclimatising route up the mountain."], ["Point Lenana summit", "Pre-dawn push for sunrise."]],
  },
  {
    slug: "hells-gate-national-park", name: "Hell's Gate National Park", category: "adventure", city: "Naivasha",
    short: "Walk or cycle among zebra and giraffe, through gorges and geothermal steam.",
    description: "One of few parks where you can cycle and walk among wildlife. Demo content - replace with real editorial copy.",
    bestTime: "June to September and December to February",
    amenities: ["Bike hire", "Gorge guides", "Geothermal spa nearby"],
    activities: [["Cycle safari", "Pedal past zebra and buffalo."], ["Gorge walk", "Guided walk through the narrow gorge."]],
  },
  {
    slug: "lamu-old-town", name: "Lamu Old Town", category: "culture-history", city: "Lamu",
    short: "A UNESCO-listed Swahili settlement with no cars - only donkeys and dhows.",
    description: "Kenya's oldest living Swahili town, with carved doors, narrow lanes and a relaxed island pace. Demo content - replace with real editorial copy.",
    bestTime: "December to March and July to October", featured: true,
    amenities: ["Museum", "Waterfront", "Craft market"],
    activities: [["Old Town walking tour", "Guided walk through lanes and mosques."], ["Dhow sunset sail", "Sail the channel at dusk."], ["Swahili cooking class", "Learn coastal dishes."]],
  },
  {
    slug: "fort-jesus-mombasa", name: "Fort Jesus & Mombasa Old Town", category: "culture-history", city: "Mombasa",
    short: "A 16th-century Portuguese fort and the lanes of Mombasa's old quarter.",
    description: "A UNESCO World Heritage Site with a museum, ramparts over the harbour and a lively old town. Demo content - replace with real editorial copy.",
    bestTime: "Year-round",
    amenities: ["Museum", "Guided tours", "Gift shop"],
    activities: [["Fort Jesus guided tour", "History from Portuguese to Omani rule."], ["Old Town food walk", "Taste coastal street food."]],
  },
  {
    slug: "watamu-marine-park", name: "Watamu Marine National Park", category: "beaches-coastal", city: "Watamu",
    short: "Coral gardens, sea turtles and calm turquoise lagoons.",
    description: "A protected marine park with excellent snorkelling and a well-known turtle conservation programme. Demo content - replace with real editorial copy.",
    bestTime: "October to March", featured: true,
    amenities: ["Glass-bottom boats", "Snorkel hire", "Turtle watch"],
    activities: [["Snorkelling at the reef", "Colourful coral gardens."], ["Turtle conservation visit", "See the rescue programme."], ["Dhow trip to Mida Creek", "Mangroves and birdlife."]],
  },
  {
    slug: "nungwi-beach-zanzibar", name: "Nungwi Beach, Zanzibar", category: "beaches-coastal", city: "Nungwi",
    short: "Powder-white sand and sunset dhows at Zanzibar's northern tip.",
    description: "One of Zanzibar's best swimming beaches, with tidal-free water and lively sunsets. Demo content - replace with real editorial copy.",
    bestTime: "June to October and December to February",
    amenities: ["Dive centres", "Beach bars", "Turtle aquarium"],
    activities: [["Sunset dhow cruise", "Traditional sail at golden hour."], ["Mnemba snorkelling", "Boat trip to Mnemba Atoll."]],
  },
  {
    slug: "serengeti-national-park", name: "Serengeti National Park", category: "wildlife-nature", city: "Serengeti",
    short: "Endless plains and the greatest wildlife migration on Earth.",
    description: "Tanzania's flagship park, with year-round predators and the wildebeest migration. Demo content - replace with real editorial copy.",
    bestTime: "June to October (migration), January to February (calving)", featured: true,
    amenities: ["Park gates", "Airstrips", "Seronera visitor centre"],
    activities: [["Big cat game drive", "Lion, leopard and cheetah country."], ["Hot-air balloon safari", "Sunrise flight over the plains."]],
  },
  {
    slug: "naivasha-farm-retreat", name: "Naivasha Farm & Rural Retreat", category: "agri-rural", city: "Naivasha",
    short: "Farm-to-table weekends beside Lake Naivasha.",
    description: "Pick vegetables, meet farm animals and take a boat on the lake - a relaxed rural escape. Demo content - replace with real editorial copy.",
    bestTime: "Year-round",
    amenities: ["Farm shop", "Boat jetty", "Kids' farm corner"],
    activities: [["Farm tour & harvest", "Pick your own produce."], ["Lake boat ride", "Hippo and birdlife."], ["Farm-to-table dinner", "Cook with what you picked."]],
  },
  {
    slug: "nairobi-dining-nightlife", name: "Nairobi Dining & Nightlife", category: "entertainment-lifestyle", city: "Nairobi",
    short: "Rooftop bars, nyama choma and live music across the capital.",
    description: "A curated look at Nairobi's food and music scene. Demo content - replace with real editorial copy.",
    bestTime: "Year-round",
    amenities: ["Guided food tours", "Live music venues"], minimumAge: 18,
    activities: [["Nyama choma tasting", "Grilled meat the Kenyan way."], ["Live music night", "Afro-fusion and benga."]],
  },
  {
    slug: "lake-victoria-sunsets", name: "Lake Victoria Sunsets", category: "wildlife-nature", city: "Kisumu",
    short: "Dhow rides and fishing villages on Africa's largest lake.",
    description: "Draft listing - content still being written.",
    bestTime: "Year-round", status: "draft",
    amenities: ["Boat hire"], activities: [["Sunset boat ride", "Golden-hour cruise."]],
  },
];

export const ENROUTE_CATEGORIES: Array<[string, string]> = [
  ["Culture & History", "culture-history"],
  ["Adventure", "adventure"],
];

export const ENROUTE_DESTINATIONS: DestSpec[] = [
  {
    slug: "fort-jesus-mombasa", name: "Fort Jesus & Mombasa Old Town", category: "culture-history", city: "Mombasa",
    short: "Enroute's guide to the fort and the old town.",
    description: "Enroute's own listing for the 16th-century fort and Old Town lanes. Demo content - replace with real editorial copy.",
    bestTime: "Year-round", featured: true,
    amenities: ["Museum", "Guided tours"], activities: [["Fort Jesus tour", "Guided history walk."], ["Old Town food walk", "Street-food tasting."]],
  },
  {
    slug: "watamu-marine-park", name: "Watamu Marine Park", category: "beaches-coastal", city: "Watamu",
    short: "Snorkel, kayak and spot turtles.",
    description: "Enroute's own listing for Watamu's marine park. Demo content - replace with real editorial copy.",
    bestTime: "October to March", featured: true,
    amenities: ["Snorkel hire", "Glass-bottom boats"], activities: [["Reef snorkelling", "Coral gardens at low tide."], ["Mida Creek kayaking", "Paddle through mangroves."]],
  },
  {
    slug: "lamu-old-town", name: "Lamu Old Town", category: "culture-history", city: "Lamu",
    short: "Dhows, carved doors and a car-free island.",
    description: "Enroute's own listing for Lamu. Demo content - replace with real editorial copy.",
    bestTime: "December to March", featured: true,
    amenities: ["Museum", "Waterfront"], activities: [["Dhow sunset sail", "Evening sail."], ["Old Town walk", "Guided lanes walk."]],
  },
  {
    slug: "malindi-marine-park", name: "Malindi Marine Park", category: "beaches-coastal", city: "Malindi",
    short: "Reef snorkelling just offshore from Malindi.",
    description: "Demo content - replace with real editorial copy.",
    bestTime: "October to March",
    amenities: ["Glass-bottom boats"], activities: [["Glass-bottom boat trip", "See the reef without getting wet."]],
  },
  {
    slug: "shimba-hills-weekend", name: "Shimba Hills Weekend (draft)", category: "adventure", city: "Diani",
    short: "Draft listing for the sable antelope reserve.",
    description: "Draft listing - content still being written.",
    bestTime: "Year-round", status: "draft",
    amenities: ["Forest walks"], activities: [["Sable antelope drive", "Early-morning drive."]],
  },
];

// --------------------------------------------------------------- operators

export interface OperatorSpec {
  key: string;
  name: string;
  slug: string;
  status: "approved" | "pending" | "suspended" | "rejected";
  email: string;
  phone: string;
  commission: string;
  description: string;
  country: string; // iso
  policies: boolean; // gets the 3 cancellation policies
}

export const DEFAULT_OPERATORS: OperatorSpec[] = [
  { key: "coastal", name: "Coastal Breeze Holidays (Demo)", slug: "coastal-breeze-holidays-demo", status: "approved", email: "coastal.ops@navimus.co.ke", phone: "+254700000101", commission: "12.00", country: "KE", policies: true, description: "Fictional demo operator specialising in Kenya's south and north coast." },
  { key: "trails", name: "Mt. Kenya Trails & Treks (Demo)", slug: "mt-kenya-trails-treks-demo", status: "approved", email: "trails.ops@navimus.co.ke", phone: "+254700000102", commission: "8.00", country: "KE", policies: true, description: "Fictional demo operator for hiking, cycling and corporate retreats." },
  { key: "heritage", name: "Swahili Heritage Tours (Demo)", slug: "swahili-heritage-tours-demo", status: "approved", email: "heritage.ops@navimus.co.ke", phone: "+254700000103", commission: "10.00", country: "KE", policies: true, description: "Fictional demo operator for culture, history and school trips." },
  { key: "lodges", name: "Savannah Lodges & Camps (Demo)", slug: "savannah-lodges-camps-demo", status: "approved", email: "stays@navimus.co.ke", phone: "+254700000104", commission: "10.00", country: "KE", policies: true, description: "Fictional demo accommodation provider - safari lodges and camps." },
  { key: "movers", name: "Kilele Transfers & Cabs (Demo)", slug: "kilele-transfers-cabs-demo", status: "approved", email: "transport@navimus.co.ke", phone: "+254700000105", commission: "10.00", country: "KE", policies: true, description: "Fictional demo transport provider - transfers, shuttles and safari vehicles." },
  { key: "pending", name: "Baobab Adventures (Pending Approval)", slug: "baobab-adventures-pending", status: "pending", email: "baobab.ops@navimus.co.ke", phone: "+254700000106", commission: "10.00", country: "KE", policies: false, description: "Fictional operator awaiting approval - use it to test the approval flow." },
  { key: "suspended", name: "Quick Safaris (Suspended)", slug: "quick-safaris-suspended", status: "suspended", email: "quick@navimus.co.ke", phone: "+254700000107", commission: "10.00", country: "KE", policies: false, description: "Fictional operator suspended for policy breaches." },
  { key: "rejected", name: "Dusty Roads Tours (Rejected)", slug: "dusty-roads-tours-rejected", status: "rejected", email: "dusty@navimus.co.ke", phone: "+254700000108", commission: "10.00", country: "KE", policies: false, description: "Fictional operator whose application was rejected." },
];

export const ENROUTE_OPERATORS: OperatorSpec[] = [
  { key: "city", name: "Enroute City & Culture Tours (Demo)", slug: "enroute-city-culture-tours-demo", status: "approved", email: "city@enroute.co.ke", phone: "+254700000201", commission: "9.00", country: "KE", policies: true, description: "Fictional second operator for the Enroute tenant." },
  { key: "dhow", name: "Enroute Dhow Charters (Pending Approval)", slug: "enroute-dhow-charters-pending", status: "pending", email: "dhow@enroute.co.ke", phone: "+254700000202", commission: "10.00", country: "KE", policies: false, description: "Fictional operator awaiting approval on the Enroute tenant." },
];

// ----------------------------------------------------------- accommodations

export interface RoomSpec { name: string; occupancy: number; price: number; meal: string; count: number }
export interface AccomSpec {
  key: string; operator: string; name: string; slug: string; type: string; city: string; description: string;
  stars: number; amenities: string[]; checkIn: string; checkOut: string; status?: "published" | "draft"; rooms: RoomSpec[];
}

export const DEFAULT_ACCOMMODATIONS: AccomSpec[] = [
  {
    key: "mara-camp", operator: "lodges", name: "Mara Acacia Tented Camp", slug: "mara-acacia-tented-camp", type: "camp", city: "Narok (Maasai Mara)",
    description: "Twelve tented suites on the edge of the reserve with private verandas. Demo content.", stars: 4,
    amenities: ["Restaurant", "Bar", "Game drives", "Solar power", "Campfire"], checkIn: "13:00", checkOut: "10:00",
    rooms: [
      { name: "Standard Tent", occupancy: 2, price: 220, meal: "full_board", count: 4 },
      { name: "Luxury Tent", occupancy: 2, price: 340, meal: "all_inclusive", count: 4 },
      { name: "Family Tent", occupancy: 4, price: 420, meal: "full_board", count: 2 },
    ],
  },
  {
    key: "amboseli-lodge", operator: "lodges", name: "Amboseli Elephant View Lodge", slug: "amboseli-elephant-view-lodge", type: "lodge", city: "Amboseli",
    description: "Lodge with Kilimanjaro views from the dining terrace. Demo content.", stars: 4,
    amenities: ["Pool", "Restaurant", "Bar", "Wi-Fi in lobby"], checkIn: "14:00", checkOut: "10:00",
    rooms: [
      { name: "Garden Room", occupancy: 2, price: 190, meal: "full_board", count: 5 },
      { name: "Kilimanjaro View Suite", occupancy: 3, price: 290, meal: "full_board", count: 3 },
    ],
  },
  {
    key: "naivasha-lodge", operator: "lodges", name: "Naivasha Lakeside Lodge", slug: "naivasha-lakeside-lodge", type: "lodge", city: "Naivasha",
    description: "Lake-view cottages with a garden and conference room. Demo content.", stars: 3,
    amenities: ["Garden", "Conference room", "Boat jetty", "Restaurant"], checkIn: "14:00", checkOut: "11:00",
    rooms: [
      { name: "Lake Cottage", occupancy: 2, price: 120, meal: "breakfast", count: 6 },
      { name: "Family Cottage", occupancy: 5, price: 190, meal: "half_board", count: 2 },
    ],
  },
  {
    key: "samburu-camp", operator: "lodges", name: "Samburu River Camp", slug: "samburu-river-camp", type: "camp", city: "Samburu",
    description: "Riverside tents under doum palms. Demo content.", stars: 4,
    amenities: ["Restaurant", "Bar", "Game drives", "Bush dinners"], checkIn: "13:00", checkOut: "10:00",
    rooms: [{ name: "Riverside Tent", occupancy: 2, price: 260, meal: "full_board", count: 6 }],
  },
  {
    key: "mtkenya-eco", operator: "trails", name: "Sirimon Alpine Eco Lodge", slug: "sirimon-alpine-eco-lodge", type: "eco_lodge", city: "Nanyuki (Mount Kenya)",
    description: "Eco-lodge at the foot of the Sirimon route, with log fires. Demo content.", stars: 3,
    amenities: ["Log fires", "Drying room", "Restaurant", "Porter booking"], checkIn: "14:00", checkOut: "10:00",
    rooms: [
      { name: "Standard Room", occupancy: 2, price: 95, meal: "half_board", count: 6 },
      { name: "Dormitory Bed", occupancy: 1, price: 35, meal: "breakfast", count: 10 },
    ],
  },
  {
    key: "diani-resort", operator: "coastal", name: "Diani Palm Beach Resort", slug: "diani-palm-beach-resort", type: "resort", city: "Diani",
    description: "Beachfront resort with three pools, a spa and a kids' club. Demo content.", stars: 5,
    amenities: ["Beachfront", "Three pools", "Spa", "Kids' club", "Water sports", "Wi-Fi"], checkIn: "14:00", checkOut: "11:00",
    rooms: [
      { name: "Garden Room", occupancy: 2, price: 180, meal: "breakfast", count: 6 },
      { name: "Ocean View Room", occupancy: 3, price: 260, meal: "half_board", count: 5 },
      { name: "Beach Villa", occupancy: 4, price: 520, meal: "all_inclusive", count: 3 },
    ],
  },
  {
    key: "mombasa-hotel", operator: "coastal", name: "Mombasa Old Port Hotel", slug: "mombasa-old-port-hotel", type: "hotel", city: "Mombasa",
    description: "Business-friendly hotel a short walk from Fort Jesus. Demo content.", stars: 3,
    amenities: ["Air conditioning", "Restaurant", "Rooftop terrace", "Airport shuttle"], checkIn: "14:00", checkOut: "11:00",
    rooms: [
      { name: "Standard Room", occupancy: 2, price: 85, meal: "breakfast", count: 8 },
      { name: "Executive Suite", occupancy: 3, price: 140, meal: "breakfast", count: 3 },
    ],
  },
  {
    key: "watamu-bungalows", operator: "coastal", name: "Watamu Reef Bungalows", slug: "watamu-reef-bungalows", type: "cottage", city: "Watamu",
    description: "Thatched bungalows steps from the marine park. Demo content.", stars: 4,
    amenities: ["Pool", "Snorkel gear", "Restaurant", "Bicycle hire"], checkIn: "14:00", checkOut: "10:30",
    rooms: [{ name: "Garden Bungalow", occupancy: 2, price: 160, meal: "half_board", count: 6 }, { name: "Sea View Bungalow", occupancy: 3, price: 230, meal: "half_board", count: 4 }],
  },
  {
    key: "lamu-house", operator: "heritage", name: "Lamu Swahili House", slug: "lamu-swahili-house", type: "guest_house", city: "Lamu",
    description: "Restored Swahili merchant house with a rooftop terrace. Demo content.", stars: 3,
    amenities: ["Rooftop terrace", "Swahili breakfast", "Fans", "Guided walks"], checkIn: "13:00", checkOut: "10:00",
    rooms: [{ name: "Courtyard Room", occupancy: 2, price: 110, meal: "breakfast", count: 5 }, { name: "Rooftop Suite", occupancy: 2, price: 165, meal: "breakfast", count: 2 }],
  },
  {
    key: "nairobi-suites", operator: "heritage", name: "Nairobi Garden Suites", slug: "nairobi-garden-suites", type: "hotel", city: "Nairobi",
    description: "Quiet garden hotel close to the national park. Demo content.", stars: 4,
    amenities: ["Garden", "Pool", "Airport shuttle", "Restaurant", "Wi-Fi"], checkIn: "14:00", checkOut: "11:00",
    rooms: [{ name: "Deluxe Room", occupancy: 2, price: 130, meal: "breakfast", count: 10 }, { name: "Two-Bedroom Suite", occupancy: 4, price: 240, meal: "breakfast", count: 3 }],
  },
  {
    key: "draft-glamp", operator: "lodges", name: "Hell's Gate Glamping (draft)", slug: "hells-gate-glamping-draft", type: "glamping", city: "Naivasha",
    description: "Draft listing - not yet published.", stars: 3, amenities: ["Fire pit"], checkIn: "14:00", checkOut: "10:00", status: "draft",
    rooms: [{ name: "Glamping Tent", occupancy: 2, price: 110, meal: "half_board", count: 4 }],
  },
];

export const ENROUTE_ACCOMMODATIONS: AccomSpec[] = [
  {
    key: "enroute-diani", operator: "escapes", name: "Enroute Beach Cottages Diani", slug: "enroute-beach-cottages-diani", type: "cottage", city: "Diani",
    description: "Self-catering cottages a minute from the sand. Demo content.", stars: 3, amenities: ["Pool", "Kitchenette", "Wi-Fi"], checkIn: "14:00", checkOut: "10:00",
    rooms: [{ name: "Garden Cottage", occupancy: 2, price: 95, meal: "room_only", count: 5 }, { name: "Family Cottage", occupancy: 5, price: 160, meal: "breakfast", count: 3 }],
  },
  {
    key: "enroute-mombasa", operator: "city", name: "Enroute Old Town Boutique", slug: "enroute-old-town-boutique", type: "guest_house", city: "Mombasa",
    description: "Boutique stay inside the old town. Demo content.", stars: 3, amenities: ["Rooftop terrace", "Breakfast", "Air conditioning"], checkIn: "14:00", checkOut: "11:00",
    rooms: [{ name: "Standard Room", occupancy: 2, price: 75, meal: "breakfast", count: 6 }],
  },
];

// ---------------------------------------------------------------- transport

export interface ProviderSpec { key: string; operator: string; name: string; phone: string }
export interface VehicleSpec { provider: string; type: string; name: string; reg: string; capacity: number }
export interface RouteSpec { key: string; provider: string; from: string; to: string; vehicle: string; price: number; minutes: number; currency?: string }

export const DEFAULT_PROVIDERS: ProviderSpec[] = [
  { key: "kilele", operator: "movers", name: "Kilele Safari Fleet", phone: "+254700000301" },
  { key: "rvs-fleet", operator: "rvs", name: "Rift Valley Safaris Fleet", phone: "+254700000302" },
  { key: "coastal-shuttles", operator: "coastal", name: "Coastal Breeze Shuttles", phone: "+254700000303" },
];

export const DEFAULT_VEHICLES: VehicleSpec[] = [
  { provider: "kilele", type: "4x4_safari_vehicle", name: "Land Cruiser Pop-top 1", reg: "KDX 101A", capacity: 6 },
  { provider: "kilele", type: "4x4_safari_vehicle", name: "Land Cruiser Pop-top 2", reg: "KDX 102B", capacity: 6 },
  { provider: "kilele", type: "van", name: "Safari Van 1", reg: "KDX 103C", capacity: 8 },
  { provider: "kilele", type: "minibus", name: "Coaster Minibus", reg: "KDX 104D", capacity: 14 },
  { provider: "rvs-fleet", type: "4x4_safari_vehicle", name: "Mara Cruiser 1", reg: "KDY 201A", capacity: 6 },
  { provider: "rvs-fleet", type: "van", name: "Mara Van", reg: "KDY 202B", capacity: 8 },
  { provider: "coastal-shuttles", type: "van", name: "Coast Shuttle Van", reg: "KDZ 301A", capacity: 8 },
  { provider: "coastal-shuttles", type: "suv", name: "Coast SUV", reg: "KDZ 302B", capacity: 5 },
  { provider: "coastal-shuttles", type: "tour_bus", name: "Coast Tour Bus", reg: "KDZ 303C", capacity: 45 },
];

export const DEFAULT_ROUTES: RouteSpec[] = [
  { key: "nbo-mara", provider: "kilele", from: "Nairobi", to: "Narok (Maasai Mara)", vehicle: "4x4_safari_vehicle", price: 380, minutes: 330 },
  { key: "nbo-mara-van", provider: "rvs-fleet", from: "Nairobi", to: "Narok (Maasai Mara)", vehicle: "van", price: 260, minutes: 360 },
  { key: "nbo-amboseli", provider: "kilele", from: "Nairobi", to: "Amboseli", vehicle: "van", price: 240, minutes: 270 },
  { key: "nbo-nakuru", provider: "kilele", from: "Nairobi", to: "Nakuru", vehicle: "van", price: 150, minutes: 150 },
  { key: "nbo-nanyuki", provider: "kilele", from: "Nairobi", to: "Nanyuki (Mount Kenya)", vehicle: "minibus", price: 200, minutes: 210 },
  { key: "nbo-naivasha", provider: "rvs-fleet", from: "Nairobi", to: "Naivasha", vehicle: "van", price: 110, minutes: 100 },
  { key: "mba-diani", provider: "coastal-shuttles", from: "Mombasa", to: "Diani", vehicle: "van", price: 70, minutes: 90 },
  { key: "mba-watamu", provider: "coastal-shuttles", from: "Mombasa", to: "Watamu", vehicle: "suv", price: 95, minutes: 120 },
  { key: "nbo-mombasa-bus", provider: "coastal-shuttles", from: "Nairobi", to: "Mombasa", vehicle: "tour_bus", price: 40, minutes: 540 },
];

export const ENROUTE_PROVIDERS: ProviderSpec[] = [
  { key: "enroute-shuttles", operator: "escapes", name: "Enroute Coast Shuttles", phone: "+254700000401" },
];
export const ENROUTE_VEHICLES: VehicleSpec[] = [
  { provider: "enroute-shuttles", type: "van", name: "Enroute Van", reg: "KEA 401A", capacity: 8 },
  { provider: "enroute-shuttles", type: "suv", name: "Enroute SUV", reg: "KEA 402B", capacity: 5 },
];
export const ENROUTE_ROUTES: RouteSpec[] = [
  { key: "e-mba-diani", provider: "enroute-shuttles", from: "Mombasa", to: "Diani", vehicle: "van", price: 65, minutes: 90 },
  { key: "e-mba-watamu", provider: "enroute-shuttles", from: "Mombasa", to: "Watamu", vehicle: "suv", price: 90, minutes: 120 },
];

// ---------------------------------------------------------------- transfers

export interface LocationSpec { key: string; name: string; type: "airport" | "hotel" | "address"; city: string; address?: string }
export interface TransferSpec { pickup: string; dropoff: string; type: "private" | "shared"; direction: "one_way" | "return"; price: number; meetAndGreet?: boolean; currency?: string }

export const DEFAULT_LOCATIONS: LocationSpec[] = [
  { key: "jkia", name: "Jomo Kenyatta International Airport (JKIA)", type: "airport", city: "Nairobi", address: "Embakasi, Nairobi" },
  { key: "wilson", name: "Wilson Airport", type: "airport", city: "Nairobi", address: "Langata Road, Nairobi" },
  { key: "mia", name: "Moi International Airport, Mombasa", type: "airport", city: "Mombasa", address: "Port Reitz, Mombasa" },
  { key: "ukunda", name: "Ukunda Airstrip (Diani)", type: "airport", city: "Diani", address: "Ukunda, Kwale County" },
  { key: "nbo-hotel", name: "Nairobi Garden Suites", type: "hotel", city: "Nairobi", address: "Nairobi" },
  { key: "diani-hotel", name: "Diani Palm Beach Resort", type: "hotel", city: "Diani", address: "Diani Beach Road" },
  { key: "mba-hotel", name: "Mombasa Old Port Hotel", type: "hotel", city: "Mombasa", address: "Old Town, Mombasa" },
];

export const DEFAULT_TRANSFERS: TransferSpec[] = [
  { pickup: "jkia", dropoff: "nbo-hotel", type: "private", direction: "one_way", price: 35, meetAndGreet: true },
  { pickup: "jkia", dropoff: "nbo-hotel", type: "shared", direction: "one_way", price: 15 },
  { pickup: "jkia", dropoff: "nbo-hotel", type: "private", direction: "return", price: 60, meetAndGreet: true },
  { pickup: "wilson", dropoff: "nbo-hotel", type: "private", direction: "one_way", price: 30 },
  { pickup: "mia", dropoff: "diani-hotel", type: "private", direction: "one_way", price: 90, meetAndGreet: true },
  { pickup: "mia", dropoff: "diani-hotel", type: "shared", direction: "one_way", price: 35 },
  { pickup: "ukunda", dropoff: "diani-hotel", type: "private", direction: "one_way", price: 20 },
  { pickup: "mia", dropoff: "mba-hotel", type: "private", direction: "one_way", price: 25 },
];

export const ENROUTE_LOCATIONS: LocationSpec[] = [
  { key: "e-mia", name: "Moi International Airport, Mombasa", type: "airport", city: "Mombasa" },
  { key: "e-ukunda", name: "Ukunda Airstrip (Diani)", type: "airport", city: "Diani" },
  { key: "e-diani-cottages", name: "Enroute Beach Cottages Diani", type: "hotel", city: "Diani" },
];
export const ENROUTE_TRANSFERS: TransferSpec[] = [
  { pickup: "e-mia", dropoff: "e-diani-cottages", type: "private", direction: "one_way", price: 85, meetAndGreet: true },
  { pickup: "e-mia", dropoff: "e-diani-cottages", type: "shared", direction: "one_way", price: 30 },
  { pickup: "e-ukunda", dropoff: "e-diani-cottages", type: "private", direction: "one_way", price: 18 },
];

// ----------------------------------------------------------------- packages

export interface PkgSpec {
  slug: string; operator: string; name: string; type: string; short: string; description: string;
  days: number; min: number; max: number; currency: "USD" | "KES"; adult: number; child?: number; infant?: number;
  featured?: boolean; status?: "published" | "draft"; destinations: string[];
  itinerary: Array<[string, string]>; inclusions: string[]; exclusions: string[];
  activities?: Array<[string, string, number | null]>; // [name, description, extra price (null = included/optional free)]
  season?: { label: string; start: string; end: string; adult: number; child?: number }; // MM-DD
  policy: PolicyKind; route?: string; room?: { accom: string; room: string }; capacity: number;
}

const STD_EXCL = ["International flights", "Travel insurance", "Tips and gratuities", "Personal expenses"];

export const DEFAULT_PACKAGES: PkgSpec[] = [
  {
    slug: "5-day-mara-nakuru-safari", operator: "rvs", name: "5-Day Mara & Lake Nakuru Safari", type: "safari",
    short: "Rhino sanctuary, flamingo shores and the Mara's big cats in five days.",
    description: "Start at Lake Nakuru for rhino and flamingos, then cross the Rift Valley to the Maasai Mara for full-day game drives. Demo content - replace with real editorial copy.",
    days: 5, min: 2, max: 12, currency: "USD", adult: 1150, child: 760, infant: 0, featured: true,
    destinations: ["lake-nakuru-national-park", "maasai-mara-national-reserve"],
    itinerary: [
      ["Nairobi to Lake Nakuru", "Morning pick-up, drive to Lake Nakuru, afternoon game drive."],
      ["Lake Nakuru to the Mara", "Early rhino drive then travel to the Maasai Mara."],
      ["Full-day Mara game drive", "Picnic lunch in the reserve, sundowner on the plains."],
      ["Mara morning and optional balloon", "Sunrise drive; optional hot-air balloon flight."],
      ["Return to Nairobi", "Breakfast and the drive back, arriving mid-afternoon."],
    ],
    inclusions: ["Park entry fees", "Full-board lodging", "4x4 safari vehicle with driver-guide", "Bottled water on drives"],
    exclusions: [...STD_EXCL, "Hot-air balloon flight"],
    activities: [["Hot-air balloon safari", "Sunrise flight over the Mara followed by a champagne breakfast.", 480], ["Maasai village visit", "Cultural visit with a local community.", 30]],
    season: { label: "High season", start: "07-01", end: "10-31", adult: 1390, child: 920 },
    policy: "strict", route: "nbo-mara", room: { accom: "mara-camp", room: "Standard Tent" }, capacity: 12,
  },
  {
    slug: "4-day-amboseli-kilimanjaro-views", operator: "rvs", name: "Amboseli: Elephants & Kilimanjaro Views", type: "safari",
    short: "Four days among elephant herds with Kilimanjaro on the horizon.",
    description: "Long game drives around Ol Tukai swamp, a visit to Observation Hill and an evening at a lodge with Kilimanjaro views. Demo content - replace with real editorial copy.",
    days: 4, min: 1, max: 10, currency: "USD", adult: 890, child: 590, infant: 0,
    destinations: ["amboseli-national-park"],
    itinerary: [
      ["Drive to Amboseli", "Depart Nairobi, lunch at the lodge, evening drive."],
      ["Full-day elephant drives", "Dawn and dusk drives with a bush picnic."],
      ["Observation Hill and Maasai visit", "Panoramic viewpoint and cultural visit."],
      ["Return to Nairobi", "Morning drive and transfer back."],
    ],
    inclusions: ["Park entry fees", "Full-board lodging", "Safari van with driver-guide", "Bottled water"],
    exclusions: STD_EXCL, policy: "moderate", route: "nbo-amboseli", room: { accom: "amboseli-lodge", room: "Garden Room" }, capacity: 10,
  },
  {
    slug: "7-day-kenya-classic-circuit", operator: "rvs", name: "7-Day Kenya Classic Circuit", type: "group",
    short: "Nakuru, Mara and Amboseli in one grand loop - small-group departures.",
    description: "The best of Kenya's parks on a scheduled small-group departure. Demo content - replace with real editorial copy.",
    days: 7, min: 4, max: 14, currency: "USD", adult: 1850, child: 1250, infant: 0, featured: true,
    destinations: ["lake-nakuru-national-park", "maasai-mara-national-reserve", "amboseli-national-park"],
    itinerary: [
      ["Nairobi to Lake Nakuru", "Group briefing and afternoon rhino drive."],
      ["Lake Nakuru to the Mara", "Cross the Rift Valley; evening in camp."],
      ["Mara full day", "Big-cat country with a picnic lunch."],
      ["Mara morning and transfer", "Final Mara drive and return towards Nairobi."],
      ["Nairobi to Amboseli", "Drive south to the foot of Kilimanjaro."],
      ["Amboseli full day", "Elephant herds and Observation Hill."],
      ["Return to Nairobi", "Morning drive, drop-off at JKIA or hotel."],
    ],
    inclusions: ["Park entry fees", "Full-board lodging", "Shared safari vehicle", "Driver-guide"],
    exclusions: STD_EXCL, season: { label: "High season", start: "07-01", end: "10-31", adult: 2150, child: 1450 },
    policy: "strict", route: "nbo-mara", room: { accom: "mara-camp", room: "Luxury Tent" }, capacity: 14,
  },
  {
    slug: "family-safari-nairobi-nakuru", operator: "rvs", name: "Family Safari: Nairobi & Naivasha", type: "family",
    short: "A gentle first safari for families with children.",
    description: "Giraffe Centre, elephant orphanage and a half-day in Nairobi National Park, then a lakeside stay in Naivasha. Demo content - replace with real editorial copy.",
    days: 3, min: 2, max: 8, currency: "USD", adult: 480, child: 300, infant: 0,
    destinations: ["nairobi-national-park", "naivasha-farm-retreat"],
    itinerary: [
      ["Nairobi: giraffes and elephants", "Giraffe Centre and the elephant orphanage."],
      ["Nairobi National Park drive", "Morning drive, then transfer to Naivasha."],
      ["Naivasha farm and lake", "Farm tour, boat ride and return."],
    ],
    inclusions: ["Park entry fees", "Breakfast and lunch", "Child seats on request", "Safari van with guide"],
    exclusions: STD_EXCL, activities: [["Lake boat ride", "Hippo-spotting boat ride on Lake Naivasha.", 25]],
    policy: "flexible", route: "nbo-naivasha", room: { accom: "naivasha-lodge", room: "Family Cottage" }, capacity: 8,
  },
  {
    slug: "diani-beach-escape", operator: "coastal", name: "Diani Beach Escape", type: "beach_holiday",
    short: "Five relaxed days on Kenya's best-known beach.",
    description: "Beachfront accommodation, a dhow trip and free time on the sand. Demo content - replace with real editorial copy.",
    days: 5, min: 1, max: 10, currency: "USD", adult: 720, child: 430, infant: 0, featured: true,
    destinations: ["diani-beach"],
    itinerary: [
      ["Arrival and beach evening", "Airport transfer and sundowner on the beach."],
      ["Free day", "Pool, spa or optional water sports."],
      ["Dhow trip and snorkelling", "Half-day sail to Wasini Island reefs."],
      ["Colobus Trust and market", "Visit the colobus monkey sanctuary and craft market."],
      ["Departure", "Breakfast and airport transfer."],
    ],
    inclusions: ["Airport transfers", "Breakfast daily", "Dhow trip with lunch"],
    exclusions: STD_EXCL, activities: [["Kite-surfing lesson", "Two-hour beginner lesson.", 85], ["Spa treatment", "Sixty-minute massage.", 60]],
    season: { label: "Peak season", start: "12-15", end: "01-15", adult: 880, child: 520 },
    policy: "flexible", route: "mba-diani", room: { accom: "diani-resort", room: "Ocean View Room" }, capacity: 10,
  },
  {
    slug: "honeymoon-diani-watamu", operator: "coastal", name: "Honeymoon: Diani & Watamu", type: "honeymoon",
    short: "Seven romantic days across two of Kenya's prettiest beaches.",
    description: "Private transfers, a beach villa and a sunset dhow dinner. Demo content - replace with real editorial copy.",
    days: 7, min: 2, max: 2, currency: "USD", adult: 1450, child: 0, infant: 0, featured: true,
    destinations: ["diani-beach", "watamu-marine-park"],
    itinerary: [
      ["Arrive in Diani", "Private transfer and welcome cocktails."],
      ["Beach and spa", "Couples' massage included."],
      ["Wasini dhow day", "Private dhow with seafood lunch."],
      ["Transfer to Watamu", "Scenic drive along the coast."],
      ["Marine park snorkel", "Private boat to the reef."],
      ["Sunset dhow dinner", "Candle-lit dinner on the water."],
      ["Departure", "Late checkout and airport transfer."],
    ],
    inclusions: ["Private transfers", "Breakfast and two dinners", "Couples' massage", "Private dhow trip"],
    exclusions: STD_EXCL, policy: "moderate", route: "mba-watamu", room: { accom: "diani-resort", room: "Beach Villa" }, capacity: 6,
  },
  {
    slug: "lamu-swahili-culture-escape", operator: "heritage", name: "Lamu Swahili Culture Escape", type: "cultural",
    short: "Four slow days in Kenya's oldest living Swahili town.",
    description: "Walk the lanes, sail a dhow and learn to cook Swahili dishes. Demo content - replace with real editorial copy.",
    days: 4, min: 1, max: 10, currency: "USD", adult: 640, child: 380, infant: 0,
    destinations: ["lamu-old-town"],
    itinerary: [
      ["Arrive in Lamu", "Boat transfer from the airstrip and rooftop sunset."],
      ["Old Town walking tour", "Mosques, museum and the donkey sanctuary."],
      ["Dhow sail to Manda", "Snorkelling and a seafood lunch."],
      ["Cooking class and departure", "Market visit, cooking class and boat to the airstrip."],
    ],
    inclusions: ["Boat transfers", "Breakfast daily", "Guided tours", "Cooking class"],
    exclusions: [...STD_EXCL, "Flights to Lamu"], policy: "flexible", room: { accom: "lamu-house", room: "Courtyard Room" }, capacity: 10,
  },
  {
    slug: "mombasa-heritage-day-trip-kes", operator: "heritage", name: "Mombasa Heritage Day Trip (KES)", type: "cultural",
    short: "A one-day tour of Fort Jesus and the old town, priced in Kenyan shillings.",
    description: "Guided visit to Fort Jesus, Old Town lanes and a street-food tasting. Priced in KES so you can test M-Pesa checkout. Demo content.",
    days: 1, min: 1, max: 20, currency: "KES", adult: 7500, child: 4500, infant: 0,
    destinations: ["fort-jesus-mombasa"],
    itinerary: [["Fort Jesus and Old Town", "Guided fort tour, Old Town walk and a Swahili lunch."]],
    inclusions: ["Entry fees", "Guide", "Swahili lunch"], exclusions: ["Hotel transfers", "Tips"], policy: "flexible", capacity: 20,
  },
  {
    slug: "mount-kenya-sirimon-trek", operator: "trails", name: "Mount Kenya Sirimon Trek", type: "adventure",
    short: "Four days to Point Lenana by the Sirimon route.",
    description: "A guided trek with porters and cooks, acclimatising in the moorland before the summit push. Demo content - replace with real editorial copy.",
    days: 4, min: 2, max: 8, currency: "USD", adult: 780, child: 0, infant: 0,
    destinations: ["mount-kenya"],
    itinerary: [
      ["Sirimon Gate to Old Moses Camp", "Forest and moorland walk, 9 km."],
      ["Old Moses to Shipton's Camp", "Longer day through the Mackinder valley."],
      ["Summit day: Point Lenana", "Pre-dawn climb to 4,985 m, then descend to Old Moses."],
      ["Descent and transfer", "Walk out and transfer to Nairobi."],
    ],
    inclusions: ["Park fees", "Guides, porters and cook", "Mountain hut accommodation", "All meals on the mountain"],
    exclusions: [...STD_EXCL, "Sleeping bag hire"], activities: [["Sleeping bag hire", "Four-season sleeping bag for the trek.", 30]],
    policy: "strict", route: "nbo-nanyuki", room: { accom: "mtkenya-eco", room: "Standard Room" }, capacity: 8,
  },
  {
    slug: "hells-gate-cycling-weekend-kes", operator: "trails", name: "Hell's Gate Cycling Weekend (KES)", type: "adventure",
    short: "A two-day cycling and gorge-walking break near Naivasha, priced in KES.",
    description: "Cycle among zebra, walk the gorge and soak in the geothermal spa. Priced in KES for M-Pesa testing. Demo content.",
    days: 2, min: 2, max: 16, currency: "KES", adult: 18500, child: 11000, infant: 0, featured: true,
    destinations: ["hells-gate-national-park"],
    itinerary: [
      ["Cycle safari", "Bike hire and a guided ride through the park."],
      ["Gorge walk and spa", "Gorge walk then geothermal spa before heading back."],
    ],
    inclusions: ["Park fees", "Bike hire", "Guide", "Lunch"], exclusions: ["Accommodation", "Spa entry"], policy: "flexible", route: "nbo-naivasha", capacity: 16,
  },
  {
    slug: "corporate-retreat-naivasha", operator: "trails", name: "Corporate Retreat: Naivasha", type: "corporate",
    short: "Team-building and strategy days beside Lake Naivasha.",
    description: "Conference room, facilitated team-building and lakeside accommodation for groups of 10 to 40. Demo content.",
    days: 3, min: 10, max: 40, currency: "USD", adult: 520, child: 0, infant: 0,
    destinations: ["naivasha-farm-retreat", "hells-gate-national-park"],
    itinerary: [
      ["Arrival and kick-off", "Check-in, welcome session and dinner."],
      ["Workshop and team challenge", "Morning workshop; afternoon outdoor challenge."],
      ["Wrap-up and departure", "Closing session and transfer back."],
    ],
    inclusions: ["Meeting room and equipment", "Facilitator", "Full-board lodging", "Transport from Nairobi"],
    exclusions: ["Alcohol", "Personal expenses"], policy: "moderate", route: "nbo-naivasha", room: { accom: "naivasha-lodge", room: "Lake Cottage" }, capacity: 40,
  },
  {
    slug: "school-trip-nairobi-kes", operator: "heritage", name: "School Educational Trip: Nairobi (KES)", type: "school",
    short: "A two-day curriculum-linked trip for school groups.",
    description: "National Museum, Nairobi National Park and the Giraffe Centre, with a teacher's guide. Priced in KES. Demo content.",
    days: 2, min: 15, max: 60, currency: "KES", adult: 6500, child: 3800, infant: 0,
    destinations: ["nairobi-national-park"],
    itinerary: [
      ["Museum and Giraffe Centre", "Guided museum visit and giraffe feeding."],
      ["Nairobi National Park", "Game drive and conservation talk."],
    ],
    inclusions: ["Entry fees", "Transport", "Packed lunches", "Teacher's guide"], exclusions: ["Accommodation"], policy: "flexible", capacity: 60,
  },
  {
    slug: "nairobi-food-and-nightlife-kes", operator: "heritage", name: "Nairobi Food & Nightlife Evening (KES)", type: "individual",
    short: "A guided evening of nyama choma, rooftop views and live music.",
    description: "Taste Nairobi on a guided evening; adults only. Priced in KES. Demo content.",
    days: 1, min: 1, max: 12, currency: "KES", adult: 5500, child: 0, infant: 0,
    destinations: ["nairobi-dining-nightlife"],
    itinerary: [["Food and music evening", "Nyama choma tasting, rooftop sundowner and a live-music venue."]],
    inclusions: ["Guide", "Food tastings", "Transport between venues"], exclusions: ["Drinks", "Tips"], policy: "flexible", capacity: 12,
  },
  {
    slug: "samburu-special-five-draft", operator: "rvs", name: "Samburu Special Five (draft)", type: "safari",
    short: "Draft package - not yet published.",
    description: "Draft package used to test publishing flows.",
    days: 4, min: 2, max: 10, currency: "USD", adult: 980, child: 650, infant: 0, status: "draft",
    destinations: ["samburu-national-reserve"],
    itinerary: [["Day 1", "Draft."], ["Day 2", "Draft."], ["Day 3", "Draft."], ["Day 4", "Draft."]],
    inclusions: ["Park fees"], exclusions: STD_EXCL, policy: "moderate", room: { accom: "samburu-camp", room: "Riverside Tent" }, capacity: 10,
  },
];

export const ENROUTE_PACKAGES: PkgSpec[] = [
  {
    slug: "mombasa-old-town-walking-tour-kes", operator: "city", name: "Mombasa Old Town Walking Tour (KES)", type: "cultural",
    short: "Half-day guided walk through Mombasa's old quarter.",
    description: "Enroute's own half-day tour, priced in KES. Demo content.",
    days: 1, min: 1, max: 15, currency: "KES", adult: 3500, child: 2000, infant: 0,
    destinations: ["fort-jesus-mombasa"],
    itinerary: [["Old Town walk", "Fort Jesus exterior, spice market and a Swahili tea stop."]],
    inclusions: ["Guide", "Tea and snacks"], exclusions: ["Fort entry (optional)"], policy: "flexible", capacity: 15,
  },
  {
    slug: "watamu-snorkel-turtle-day", operator: "escapes", name: "Watamu Snorkel & Turtle Day", type: "beach_holiday",
    short: "A full day on the reef with a turtle-conservation visit.",
    description: "Enroute's own Watamu day trip. Demo content.",
    days: 1, min: 2, max: 12, currency: "USD", adult: 95, child: 60, infant: 0, featured: true,
    destinations: ["watamu-marine-park"],
    itinerary: [["Reef and turtles", "Boat to the reef, snorkelling, lunch and the turtle rescue centre."]],
    inclusions: ["Boat", "Snorkel gear", "Lunch", "Conservation fee"], exclusions: ["Transfers from Mombasa"], policy: "flexible", route: "e-mba-watamu", capacity: 12,
  },
  {
    slug: "lamu-dhow-sunset-experience", operator: "city", name: "Lamu Dhow Sunset Experience", type: "couple",
    short: "A private sunset dhow sail for two.",
    description: "Enroute's own Lamu experience. Demo content.",
    days: 1, min: 2, max: 2, currency: "USD", adult: 120, child: 0, infant: 0,
    destinations: ["lamu-old-town"],
    itinerary: [["Sunset sail", "Private dhow, fresh seafood and a quiet channel at dusk."]],
    inclusions: ["Private dhow", "Seafood dinner"], exclusions: ["Flights to Lamu"], policy: "flexible", capacity: 4,
  },
  {
    slug: "diani-honeymoon-five-nights", operator: "escapes", name: "Diani Honeymoon: Five Nights", type: "honeymoon",
    short: "Five nights of beach, spa and a private dhow dinner.",
    description: "Enroute's own honeymoon package. Demo content.",
    days: 6, min: 2, max: 2, currency: "USD", adult: 1180, child: 0, infant: 0,
    destinations: ["diani-beach"],
    itinerary: [
      ["Arrival", "Welcome drinks and a private dinner on the sand."],
      ["Spa day", "Couples' treatment."],
      ["Dhow day", "Private dhow to Wasini."],
      ["Free day", "Beach, pool or optional kite-surfing."],
      ["Colobus Trust and market", "Gentle morning excursion."],
      ["Departure", "Late checkout."],
    ],
    inclusions: ["Private transfers", "Breakfast", "Couples' spa", "Dhow day"], exclusions: STD_EXCL, policy: "moderate", route: "e-mba-diani", room: { accom: "enroute-diani", room: "Garden Cottage" }, capacity: 5,
  },
  {
    slug: "shimba-hills-weekend-draft", operator: "escapes", name: "Shimba Hills Weekend (draft)", type: "adventure",
    short: "Draft package - not yet published.", description: "Draft package.",
    days: 2, min: 2, max: 8, currency: "USD", adult: 210, child: 140, infant: 0, status: "draft",
    destinations: ["shimba-hills-weekend"], itinerary: [["Day 1", "Draft."], ["Day 2", "Draft."]],
    inclusions: ["Park fees"], exclusions: STD_EXCL, policy: "flexible", capacity: 8,
  },
];
