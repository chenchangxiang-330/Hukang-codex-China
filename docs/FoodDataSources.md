# China food and medicine data sources

Phase 0/1 creates models and repository interfaces only. No source below is
queried, scraped, imported, paid for, or configured as a production provider.
Open Food Facts and Wikidata are excluded, including fallback and seed imports.

The first future catalog will use self-photographed mainland-market packaging
and independently confirmed records. User records default to private local
storage. Central sharing, packaging-image publication, commercial imports and
redistribution need explicit rights rather than assuming public access grants a
license. No complete open, commercially reusable China branded-food nutrition
database has been verified for this project.

## Candidate food-source rights and coverage

Mainland availability below describes the provider's domestic positioning, not
a completed carrier-network test. Unknown rights mean the source cannot yet be
used for bulk cache/import/redistribution. Counts are not promises of API access.

| Source | Mainland access / API | Coverage and barcode / nutrition | Commercial use and License | Cache / redistribution | Update information |
| --- | --- | --- | --- | --- | --- |
| [China Article Numbering Center / GDS](https://passport.gds.org.cn/Account/EnterpriseRegister) | Domestic institution; authorized interface services exist, public-developer access not verified | Product identity and GTIN; current accessible count and full food nutrition coverage unverified | Service agreement and specific authorization; no verified open-data license | Both require contract verification | API SLA and product update cadence unverified |
| [China CDC prepackaged nutrition label system](https://nlc.chinanutri.cn/) | Domestic public query; public API not verified | Product/name/barcode and label query; count, hit rate and completeness unverified | Commercial database-import permission / open license not found | Both unverified | Refresh SLA unverified |
| [China Food Composition Data Center](https://fndc.chinanutri.cn/) | Domestic reference query; public API not verified | Ordinary-food reference data, not GTIN branded products; 2019 introduction cited about 1,300 foods / 31 nutrients, current coverage unverified | Data copyright retained; import requires permission | Both unverified | Edition-dependent, current update cadence unverified |
| [Government food sampling information](https://spcjsac.gsxt.gov.cn/) | Domestic official public notices; public bulk API not verified | Sample, manufacturer, lot and safety items; not complete barcode/nutrition facts | Publication is not a verified bulk dataset reuse license | Bulk mirror / redistribution rights unverified | Notices updated with sampling publications |
| Manufacturer official sites and formal product documents | Domestic brands / documents; no unified public API verified | Own products; barcode and complete nutrition not guaranteed | Brand-specific permission for documents, pictures and bulk reuse | Per written license | Manufacturer-specific |
| [Juhe barcode API](https://www.juhe.cn/docs/api/id/489) | Domestic authenticated API | Name/specification etc.; accessible count, complete nutrients and hit rate unverified | [Service agreement](https://www.juhe.cn/legal) and subscription-specific contract; no open dataset license verified | Offline TTL and redistribution require explicit contractual terms | SLA unverified |
| [Tianapi barcode API](https://www.tianapi.com/apiview/138) | Domestic API with key | Name/brand/manufacturer etc.; complete nutrition unproven, image links can be short-lived | [Service agreement](https://www.tianapi.com/article/1) and explicit use authorization | Long-term caching and redistribution need written verification | SLA unverified |
| [Tianapi nutrition API](https://www.tianapi.com/apiview/121) | Domestic API with key | Documentation describes about 2,000 ordinary foods; not GTIN package-label database | Same service agreement; upstream data rights also need verification | Both governed by explicit agreement | Current update cadence unverified |
| Team-owned package photographs and manual verification | Offline collection; no third-party API | Exact photographed market SKU, GTIN, ingredients and label; coverage grows with collection | Private/local use; photo and public-catalog rights tracked independently | Local cache; central publishing separately authorized | Each collection / confirmation dated |
| User package photographs and corrections | Offline collection | User's actual packaging version and label, not guessed from food averages | No automatic public license or central submission | Private local record; sharing requires separate authorization | Capture, edit and confirmation times retained |

Data-use policy is per source/field: `commercialUse`, `cache`, `redistribute`,
`license`, `cacheTtlSeconds`, authorization reference and source timestamps.
`unknown` does not become `allowed` just because an HTTP query succeeds.

## Nutrition label compatibility

The model supports GB 28050-2011 and GB 28050-2025 together. The 2025 standard's
implementation date is **2027-03-16**; older compliant products can remain on
sale through their shelf life. [NHC official questions and answers](https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml).

Keep printed per-100g/per-100mL/per-serving columns separate. Store original
energy units (kJ first), amount comparators and independent NRV% cells. Sugar
does not mean added sugar; missing or slash/dash NRV remains null. The newer
label includes sugar and saturated-fat requirements. Do not reverse-calculate
quantities from NRV% or use ordinary-food composition as branded-product facts.

## Independent medicine sources (future)

| Candidate | Intended role | Rights / coverage status |
| --- | --- | --- |
| User drug box and leaflet | First private local record with raw OCR and user confirmation | No automatic central/published license |
| [NMPA official services](https://www.nmpa.gov.cn/zwfwqjd/index.html?type=pc) | On-demand approval identity verification | Open commercial API, bulk cache/import and redistribution rights not verified |
| [CDE marketed-drug information](https://www.cde.org.cn/main/xxgk/listpage/b40868b5e21c038a6aa8b4319d21b07d) | Official marketed/leaflet reference | Packaging/barcode completeness and bulk commercial reuse rights not assumed |
| Manufacturer approved materials | Packaging and leaflet version checking | Manufacturer-specific reuse permission required |
| Authorized domestic enterprise data providers | Later contract evaluation only | Coverage, API, cache TTL and redistribution must be checked in contract |

Domestic approval patterns include `国药准字H/Z/S` plus eight digits, and
`HC/ZC/SC`, `HJ/ZJ/SJ` variants. Historical text remains raw evidence.
Pattern matching is a candidate, not official approval validation or a
counterfeit-drug verdict. [Drug Registration Measures, article 123](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2023/art_3275cb2a929d4c34ac8c0421b2a9c257.html).
