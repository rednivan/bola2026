import "dotenv/config"
import { syncTeamsFromApi, syncMatchesFromApi } from "@/lib/sync"

async function main() {
  console.log(await syncTeamsFromApi())
  console.log(await syncMatchesFromApi())
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
