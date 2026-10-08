# Food infrastructure boundary

Phase 0/1 contains contracts only. No database adapter, network provider, seed
catalog, synchronization, bulk import, or food UI runs in the application.

Future composition is `LocalChinaFoodSource` first, followed only by explicitly
authorized mainland providers. `HukangChinaFoodService` is reserved for a
Hukang-controlled service deployed in mainland China; the interface does not
enable network access. A lookup miss must allow package-photo collection and
user confirmation instead of being called an OCR failure.

Open Food Facts, Wikidata, and foreign fallback providers are excluded. Public
query access alone does not grant cache, commercial-use, or redistribution rights.
