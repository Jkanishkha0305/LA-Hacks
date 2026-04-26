# LA Data Migration Plan

## Current NYC Data Sources → LA GeoHub Equivalents

### 1. Address Geocoding
**NYC**: `https://geosearch.planninglabs.nyc/v2/search` (BBL, BIN, borough data)
**LA**: LA City GeoHub parcels + Google Maps geocoding API
- Parcel boundaries: `https://services.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LA_City_Parcels/FeatureServer/0`
- Geocoding: Google Maps API for address → lat/lng

### 2. Zoning Data  
**NYC**: `https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/nyzd/FeatureServer/0`
**LA**: ZIMAS zoning via GeoHub
- URL: `https://services.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/Zoning/FeatureServer/0`
- Fields: ZONE_CODE, HEIGHT_DIST, FAR, DESIGNATION

### 3. Parcel/Lot Data
**NYC**: PLUTO dataset via Socrata (`64uk-42ks`)
**LA**: LA City Parcels + LA County Assessor
- Parcels: GeoHub FeatureServer
- Assessor: `https://assessor.lacounty.gov/api/property/` (or PAIS system)

### 4. Fire Hazard Zones
**NYC**: None (not applicable)
**LA**: Very High Fire Hazard Severity Zones
- URL: `https://services.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/VHFHSZ/FeatureServer/0`
- This is a LA-specific killer feature!

### 5. Earthquake Fault Zones
**NYC**: None (not applicable)  
**LA**: Alquist-Priolo Earthquake Fault Zones
- URL: `https://services.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/Alquist_Priolo_Fault_Zones/FeatureServer/0`
- Another LA-specific differentiator

### 6. Transit/TOC Data
**NYC**: MIH areas (Mandatory Inclusionary Housing)
**LA**: TOC (Transit Oriented Communities) Tiers
- URL: `https://services.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/TOC_Tiers/FeatureServer/0`
- Critical for density bonus calculations

### 7. Building Permits
**NYC**: DOB permits via Socrata (`ipu4-2q9a`)
**LA**: LADBS Building Permit Data
- URL: `https://services.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LADBS_Permits/FeatureServer/0`

### 8. Violations/Complaints
**NYC**: DOB/HPD violations via Socrata
**LA**: LADBS Code Enforcement + LAPD data (if needed for professional mode)

## Implementation Priority

### Phase 1 (Core Functionality)
1. ✅ Geocoding (Google Maps API)
2. ✅ Parcel boundaries (GeoHub)
3. ✅ Zoning data (ZIMAS)
4. ✅ Basic map rendering

### Phase 2 (LA Differentiators) 
5. 🔄 Fire hazard zones
6. 🔄 Earthquake fault zones
7. 🔄 TOC transit tiers

### Phase 3 (Professional Mode)
8. 🔄 Building permits
9. 🔄 Assessor data
10. 🔄 Violations/complaints

## Data Schema Mapping

### NYC → LA Field Mapping
| NYC Field | LA Field | Source |
|-----------|----------|---------|
| BBL | APN | LA Parcels |
| Borough | City/Region | LA Parcels |
| ZONEDIST | ZONE_CODE | ZIMAS |
| Block/Lot | APN split | LA Parcels |
| BIN | Building ID | LADBS |

## API Endpoints to Replace

### Files to Modify
- `lib/config/data-sources.ts` - Update all URLs
- `lib/api/geosearch.ts` - Replace NYC geocoding
- `lib/api/layer-fetchers.ts` - Update all layer fetchers
- `lib/zoning.ts` - Update zoning logic
- Any hardcoded NYC references in components
