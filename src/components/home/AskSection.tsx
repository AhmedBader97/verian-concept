import Link from "next/link";
import { AskLibrary } from "@/components/shared/AskLibrary";
import { RevealLines } from "@/components/shared/RevealLines";
import { LIBRARY } from "@/data/library";
import styles from "./HomeSections.module.css";

export function AskSection() {
  return (
    <section className={`section ${styles.opaque}`} id="ask" aria-labelledby="ask-title">
      <div className="container">
        <div className={styles.askGrid}>
          <div className={styles.askIntro}>
            <RevealLines as="h2" id="ask-title" className="h2">
              Ask our library
            </RevealLines>
            <p className="lede">
              Search {LIBRARY.length} case studies, reports and insights by asking a question. Every sentence in the answer
              cites the piece of work it comes from, and when the library doesn&rsquo;t cover something, it says so.
            </p>
            <p className={styles.askSmall}>
              Runs entirely in your browser. Nothing you type is sent anywhere.{" "}
              <Link className="link" href="/lab/">
                See how it works
              </Link>
            </p>
          </div>
          <div className={styles.askTool}>
            <AskLibrary compact />
          </div>
        </div>
      </div>
    </section>
  );
}
