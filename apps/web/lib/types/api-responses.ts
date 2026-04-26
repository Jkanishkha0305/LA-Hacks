/** LAPD Crime Data row (2nrs-mtv8) */
export interface LapdCrimeRow {
  dr_no: string
  date_rptd: string
  date_occ: string
  time_occ: string
  area: string
  area_name: string
  rpt_dist_no: string
  part_1_2: string
  crm_cd: string
  crm_cd_desc: string
  vict_age: string
  vict_sex: string
  premis_desc: string
  status: string
  status_desc: string
  lat: string
  lon: string
  location: string
}

/** MyLA311 Service Request row (rq3b-xjk8) */
export interface MyLA311Row {
  srnumber: string
  createddate: string
  updateddate: string
  actiontaken: string
  requesttype: string
  status: string
  closeddate: string
  address: string
  zipcode: string
  latitude: string
  longitude: string
  nc: string
  ncname: string
  cd: string
  policeprecinct: string
}

/** MyLA311 Cases 2026 row (2cy6-i7zn) */
export interface MyLA311_2026Row {
  casenumber: string
  createddate: string
  closeddate: string
  type: string
  status: string
  origin: string
  zipcode__c: string
  geolocation__latitude__s: string
  geolocation__longitude__s: string
  locator_council_district: string
}

/** LAHD Violations row (cr8f-uc4j) — keyed by APN */
export interface LahdViolationRow {
  apn: string
  address: string
  violationtype: string
  violations_cited: string
  violations_cleared: string
}

/** LAHD Investigation & Enforcement row (eagk-wq48) — keyed by APN */
export interface LahdInvestigationRow {
  apn: string
  officialaddress: string
  case_filed_date: string
  closed_date: string
  casetype: string
}

/** Census ACS API response row */
export type CensusAcsRow = string[]

/** FCC geocoder response */
export interface FccGeocoderResponse {
  Block: {
    FIPS: string
  }
  County: {
    FIPS: string
    name: string
  }
  State: {
    FIPS: string
    code: string
    name: string
  }
  status: string
}

/** HUD FMR API response — field names use hyphens */
export interface HudFmrResponse {
  data: {
    area_name: string
    basicdata: {
      Efficiency: number
      "One-Bedroom": number
      "Two-Bedroom": number
      "Three-Bedroom": number
      "Four-Bedroom": number
      year: string
    }
  }
}
