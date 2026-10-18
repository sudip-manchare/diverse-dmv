/** Public Google office exploration contract. No member data or credentials. */
export const OFFICE_PRESETS = {
  metro: {
    label: "Washington metro",
    lat: 38.9072,
    lng: -77.0369,
    radius: 28000,
    zoom: 10,
  },
  dc: {
    label: "Washington, D.C.",
    lat: 38.9072,
    lng: -77.0369,
    radius: 12000,
    zoom: 11,
  },
  maryland: {
    label: "Maryland suburbs · Bethesda, Rockville, Silver Spring",
    lat: 39.047,
    lng: -77.11,
    radius: 20000,
    zoom: 10,
  },
  virginia: {
    label: "Northern Virginia · Arlington to Herndon",
    lat: 38.91,
    lng: -77.23,
    radius: 27000,
    zoom: 10,
  },
  baltimore: {
    label: "Maryland · Baltimore and surroundings",
    lat: 39.29,
    lng: -76.61,
    radius: 35000,
    zoom: 9,
  },
} as const;
export type OfficePreset = keyof typeof OFFICE_PRESETS;
export type OfficeArea = { lat: number; lng: number; radius: number };
export type Office = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  types: string[];
  businessStatus: string;
  mapsUri: string;
  attributions: { provider: string; uri?: string }[];
};
export type OfficeSearchInput = {
  preset?: OfficePreset;
  area?: OfficeArea;
  company?: string;
  pageToken?: string;
};
export type OfficeSearchResponse = {
  offices: Office[];
  nextPageToken?: string;
  area: OfficeArea;
  areaLabel: string;
  mode: "nearby" | "company";
};
