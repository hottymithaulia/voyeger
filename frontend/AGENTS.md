## Project architecture
- Keep travel content in IndexedDB and read it through `src/data/repo.ts`; API adapters may only feed that store so online and offline use one content path.
