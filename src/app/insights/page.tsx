import type { Metadata } from "next";
import { LibraryBrowser } from "@/components/insights/LibraryBrowser";
import { LibraryHealth } from "@/components/insights/LibraryHealth";
import { AskLibrary } from "@/components/shared/AskLibrary";
import { LIBRARY } from "@/data/library";
import styles from "@/components/insights/Insights.module.css";

export const metadata: Metadata = {
  title: "Insights",
  description: "Verian's case studies, reports, insights and events, searchable by question and as a knowledge graph.",
};

export default function InsightsPage() {
  const cases = LIBRARY.filter((i) => i.kind === "case-study").length;
  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <h1 className="h1">
            News, insights and case studies
          </h1>
          <p className={`lede ${styles.heroLede}`}>
            {LIBRARY.length} pieces of work, including {cases} case studies, on the public policy questions governments are
            asking now. Ask a question, follow the map, or browse.
          </p>
        </div>
      </section>
      <section className={styles.askBand} id="ask" aria-label="Ask the library">
        <div className="container">
          <AskLibrary />
        </div>
      </section>
      <div className="container">
        <LibraryBrowser />
      </div>
      <div className={styles.healthBand}>
        <div className="container">
          <LibraryHealth />
        </div>
      </div>
    </>
  );
}
