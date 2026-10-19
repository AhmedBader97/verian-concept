/**
 * Verian office locations, as listed on veriangroup.com/about-us/locations
 * (retrieved October 2026). Coordinates are approximate city positions.
 */
export type Region = "Europe" | "APAC" | "North America";

export interface Office {
  city: string;
  country: string;
  region: Region;
  address: string;
  lat: number;
  lon: number;
  note?: string;
}

export const OFFICES: Office[] = [
  { city: "London", country: "United Kingdom", region: "Europe", address: "4 Millbank, Westminster, London SW1P 3JA", lat: 51.4955, lon: -0.1263 },
  { city: "Brussels", country: "Belgium", region: "Europe", address: "Avenue des Arts 58, 1000 Brussels", lat: 50.8467, lon: 4.3699 },
  { city: "Copenhagen", country: "Denmark", region: "Europe", address: "V74, Vesterbrogade 74, 4th floor, 1620 København", lat: 55.6713, lon: 12.5466 },
  { city: "Helsinki", country: "Finland", region: "Europe", address: "Mikonkatu 9, 00100 Helsinki", lat: 60.1708, lon: 24.9461 },
  { city: "Paris", country: "France", region: "Europe", address: "73 rue de Vaugirard, 75006 Paris", lat: 48.8462, lon: 2.3311 },
  { city: "Munich", country: "Germany", region: "Europe", address: "Landsberger Str. 187, Haus D, 80687 München", lat: 48.1418, lon: 11.5122 },
  { city: "Vilnius", country: "Lithuania", region: "Europe", address: "Gedimino pr. 50, LT-01110 Vilnius", lat: 54.6872, lon: 25.2797, note: "PPMI" },
  { city: "Oslo", country: "Norway", region: "Europe", address: "Lakkegata 23, 0187 Oslo", lat: 59.9165, lon: 10.7616 },
  { city: "Barcelona", country: "Spain", region: "Europe", address: "Calle de Pallars 193, 08005 Barcelona", lat: 41.4005, lon: 2.1967 },
  { city: "Madrid", country: "Spain", region: "Europe", address: "Paseo de la Castellana 93B, 28046 Madrid", lat: 40.4495, lon: -3.6915 },
  { city: "Stockholm", country: "Sweden", region: "Europe", address: "Slottsbacken 8, 111 30 Stockholm", lat: 59.3262, lon: 18.0742 },
  { city: "Gothenburg", country: "Sweden", region: "Europe", address: "Mässans gata 10, 412 51 Göteborg", lat: 57.6971, lon: 11.9893 },
  { city: "Amsterdam", country: "Netherlands", region: "Europe", address: "Hoogoorddreef 62, Center Point II, 1101 BE Amsterdam", lat: 52.3125, lon: 4.9467 },
  { city: "Silver Spring", country: "United States", region: "North America", address: "10770 Columbia Pike, Ste 300, Silver Spring, MD 20901", lat: 39.0398, lon: -76.9828, note: "Washington area" },
  { city: "Sydney", country: "Australia", region: "APAC", address: "Level 6, 320 Pitt St, Sydney NSW 2000", lat: -33.8761, lon: 151.2079 },
  { city: "Canberra", country: "Australia", region: "APAC", address: "Level 2, 9 Sydney Avenue, Barton ACT 2600", lat: -35.3082, lon: 149.1316 },
  { city: "Melbourne", country: "Australia", region: "APAC", address: "88 Langridge St, Collingwood VIC 3066", lat: -37.8034, lon: 144.9877 },
  { city: "Brisbane", country: "Australia", region: "APAC", address: "Waterfront Place, Level 11, Suite 5, 1 Eagle Street, Brisbane 4000", lat: -27.4669, lon: 153.0301 },
  { city: "Adelaide", country: "Australia", region: "APAC", address: "Suite 9, 217-219 Flinders Street, Adelaide SA 5000", lat: -34.9264, lon: 138.6045 },
  { city: "Perth", country: "Australia", region: "APAC", address: "Level 10, 111 St George's Terrace, Perth WA 6000", lat: -31.9547, lon: 115.8576 },
  { city: "Auckland", country: "New Zealand", region: "APAC", address: "Level 6, Suite 601, 48 Greys Ave, Auckland 1010", lat: -36.8519, lon: 174.7618 },
  { city: "Wellington", country: "New Zealand", region: "APAC", address: "Level 9, 101 Lambton Quay, Wellington 6011", lat: -41.2826, lon: 174.7762 },
  { city: "Singapore", country: "Singapore", region: "APAC", address: "6 Raffles Boulevard, #03-308 Marina Square, Singapore 039594", lat: 1.2911, lon: 103.8577 },
];

export const OFFICE_COUNT = OFFICES.length;
export const COUNTRY_COUNT = new Set(OFFICES.map((o) => o.country)).size;
export const REGIONS: Region[] = ["Europe", "APAC", "North America"];
