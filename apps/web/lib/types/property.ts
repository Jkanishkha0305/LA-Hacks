import { z } from "zod"

export const geocodedAddressSchema = z.object({
  bbl: z.string(),
  bin: z.string(),
  lat: z.number(),
  lng: z.number(),
  borough: z.string(),
  block: z.string(),
  lot: z.string(),
  zipCode: z.string(),
  label: z.string(),
  neighbourhood: z.string().nullable(),
})
export type GeocodedAddress = z.infer<typeof geocodedAddressSchema>

export const parcelDataSchema = z.object({
  bbl: z.string(),
  address: z.string().nullable(),
  bldgclass: z.string().nullable(),
  landuse: z.string().nullable(),
  ownername: z.string().nullable(),
  lotarea: z.number().nullable(),
  bldgarea: z.number().nullable(),
  resarea: z.number().nullable(),
  officearea: z.number().nullable(),
  retailarea: z.number().nullable(),
  numfloors: z.number().nullable(),
  unitsres: z.number().nullable(),
  unitstotal: z.number().nullable(),
  yearbuilt: z.number().nullable(),
  zonedist1: z.string().nullable(),
  builtfar: z.number().nullable(),
  residfar: z.number().nullable(),
  commfar: z.number().nullable(),
  facilfar: z.number().nullable(),
})
export type ParcelLookupData = z.infer<typeof parcelDataSchema>

export const violationSchema = z.object({
  source: z.enum(["DOB", "HPD"]),
  id: z.string(),
  type: z.string().nullable(),
  date: z.string().nullable(),
  status: z.string().nullable(),
  description: z.string().nullable(),
  class: z.string().nullable(), // HPD: A/B/C
})
export type Violation = z.infer<typeof violationSchema>

export const permitSchema = z.object({
  jobNumber: z.string(),
  permitType: z.string().nullable(),
  jobType: z.string().nullable(),
  status: z.string().nullable(),
  filingDate: z.string().nullable(),
  issuanceDate: z.string().nullable(),
  workType: z.string().nullable(),
})
export type Permit = z.infer<typeof permitSchema>

export const complaintSchema = z.object({
  uniqueKey: z.string(),
  type: z.string().nullable(),
  descriptor: z.string().nullable(),
  status: z.string().nullable(),
  createdDate: z.string().nullable(),
  closedDate: z.string().nullable(),
})
export type Complaint = z.infer<typeof complaintSchema>

export const salesCompSchema = z.object({
  borough: z.string().nullable(),
  neighbourhood: z.string().nullable(),
  buildingClass: z.string().nullable(),
  address: z.string().nullable(),
  salePrice: z.number().nullable(),
  saleDate: z.string().nullable(),
  grossSqft: z.number().nullable(),
  landSqft: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  totalUnits: z.number().nullable(),
})
export type SalesComp = z.infer<typeof salesCompSchema>

export const rentDataSchema = z.object({
  zipCode: z.string(),
  efficiency: z.number().nullable(),
  oneBr: z.number().nullable(),
  twoBr: z.number().nullable(),
  threeBr: z.number().nullable(),
  fourBr: z.number().nullable(),
  areaName: z.string().nullable(),
  year: z.number().nullable(),
})
export type RentData = z.infer<typeof rentDataSchema>

export const crimeDataSchema = z.object({
  totalIncidents: z.number(),
  byCategory: z.record(z.string(), z.number()),
  bySeverity: z.object({
    felony: z.number(),
    misdemeanor: z.number(),
    violation: z.number(),
  }),
  radiusMeters: z.number(),
})
export type CrimeData = z.infer<typeof crimeDataSchema>

export const censusDataSchema = z.object({
  medianHouseholdIncome: z.number().nullable(),
  tract: z.string().nullable(),
  state: z.string().nullable(),
  county: z.string().nullable(),
})
export type CensusData = z.infer<typeof censusDataSchema>

export const propertyEvaluationSchema = z.object({
  property: z.object({
    bbl: z.string(),
    address: z.string(),
    borough: z.string(),
    neighbourhood: z.string().nullable(),
  }),
  fundamentals: z.object({
    buildingClass: z.string().nullable(),
    totalUnits: z.number().nullable(),
    yearBuilt: z.number().nullable(),
    zoning: z.string().nullable(),
    far: z.number().nullable(),
    lotArea: z.number().nullable(),
    buildingArea: z.number().nullable(),
  }),
  risk: z.object({
    level: z.enum(["low", "medium", "high"]),
    dobViolations: z.number(),
    hpdViolations: z.number(),
    openPermits: z.number(),
    complaints: z.number(),
    reasoning: z.string(),
  }),
  market: z.object({
    avgPricePerSqft: z.number().nullable(),
    recentSales: z.number(),
    fmrRange: z.string().nullable(),
  }),
  location: z.object({
    medianIncome: z.number().nullable(),
    crimeLevel: z.enum(["low", "moderate", "high"]).nullable(),
  }),
  evaluation: z.string(),
})
export type PropertyEvaluation = z.infer<typeof propertyEvaluationSchema>
