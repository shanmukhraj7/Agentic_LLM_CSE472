import { searchCourses } from "@/lib/rag/searchCourses";
import { client } from "@/lib/db/client";

async function main() {
  const queries = [
    "learn react from scratch",
    "kubernetes for beginners",
    "statistics for data analysis",
  ];

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    console.log("----------------------------------------");
    const results = await searchCourses({ query, limit: 5 });
    for (const [index, hit] of results.entries()) {
      console.log(
        `${index + 1}. [${hit.score.toFixed(4)}] ${hit.title} (${hit.provider}, ${hit.level}, ${hit.durationHrs}h)`
      );
    }
  }
}

main()
  .catch((err) => {
    console.error("Search test error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
