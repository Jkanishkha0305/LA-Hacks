// LA Decision Engine - LA City Open Data (Socrata)
export const LA_SOCRATA_BASE = "https://data.lacity.org/resource"

export const LA_SOCRATA_DATASETS = {
  parcels: "qyra-qm2s", // LA City Parcels
  zoning: "jjxn-vhan", // ZONING_PLY source behind the public Zoning map
  cityOwnedParcels: "enm8-v9bz", // City Owned Parcels (2015)
  crime: "2nrs-mtv8", // LAPD Crime Data from 2020 to Present
  complaints311: "rq3b-xjk8", // MyLA311 Service Request Data
  complaints311_2026: "2cy6-i7zn", // MyLA311 Cases 2026
  lahdViolations: "cr8f-uc4j", // LAHD Property Look-Up for Violations (by APN)
  lahdInvestigation: "eagk-wq48", // LAHD Investigation and Enforcement Cases (by APN)
} as const

export const LA_ARCGIS_LAYERS = {
  fireHazard:
    "https://maps.lacity.org/lahub/rest/services/Special_Areas/MapServer/11/query",
  faultZones:
    "https://maps.lacity.org/lahub/rest/services/Geotechnical_and_Hydrological_Information/MapServer/0/query",
  tocTiers:
    "https://services1.arcgis.com/tzwalEyxl2rpamKs/arcgis/rest/services/TOC_Tiers_Oct2017_new/FeatureServer/0/query",
  buildingFootprints:
    "https://services.arcgis.com/RmCCgQtiZLDCtblq/ArcGIS/rest/services/Los_Angeles/FeatureServer/0/query",
  liquefaction:
    "https://maps.lacity.org/lahub/rest/services/Geotechnical_and_Hydrological_Information/MapServer/5/query",
  landslide:
    "https://maps.lacity.org/lahub/rest/services/Geotechnical_and_Hydrological_Information/MapServer/4/query",
  hpoz:
    "https://maps.lacity.org/lahub/rest/services/City_Planning_Department/MapServer/10/query",
  ladbsPermits:
    "https://maps.lacity.org/lahub/rest/services/LADBS/MapServer/0/query",
} as const

// Socrata base URL — all LA datasets are on data.lacity.org
export const SOCRATA_BASE_URL = LA_SOCRATA_BASE

export const CENSUS_BASE_URL =
  "https://api.census.gov/data/2022/acs/acs5"

export const FCC_GEOCODER_URL =
  "https://geo.fcc.gov/api/census/block/find"

export const HUD_FMR_BASE_URL =
  "https://www.huduser.gov/hudapi/public/fmr/data"
