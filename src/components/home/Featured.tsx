import { RevealLines } from "@/components/shared/RevealLines";
import { VERIAN } from "@/data/site";
import styles from "./HomeSections.module.css";

/**
 * Three flagship programmes. Each small graphic encodes a fact from the
 * programme itself (twelve countries, six principles, running since 2018).
 */
export function Featured() {
  return (
    <section className={`section ${styles.opaque} ${styles.featuredBand}`} aria-labelledby="featured-title">
      <div className="container">
        <div className={styles.sectionHead}>
          <RevealLines as="h2" id="featured-title" className="h2">
            Our thinking
          </RevealLines>
          <p className="lede">Long-running programmes that put citizens&rsquo; views in front of decision-makers.</p>
        </div>

        <div className={styles.featured}>
          <a className={`${styles.feature} ${styles.featureLead}`} href={`${VERIAN}/news-and-insights/preparedness-index`} target="_blank" rel="noreferrer">
            <div className={styles.featureArt} aria-hidden>
              <svg viewBox="0 0 240 180" className={styles.tiles}>
                {Array.from({ length: 12 }, (_, i) => {
                  const x = (i % 4) * 60;
                  const y = Math.floor(i / 4) * 60;
                  const up = (i + Math.floor(i / 4)) % 2 === 0;
                  return (
                    <path
                      key={i}
                      d={up ? `M${x + 30} ${y + 8}L${x + 54} ${y + 52}L${x + 6} ${y + 52}Z` : `M${x + 6} ${y + 8}L${x + 54} ${y + 8}L${x + 30} ${y + 52}Z`}
                      style={{ ["--i" as string]: i }}
                    />
                  );
                })}
              </svg>
              <span className={styles.artNote}>One tile per country surveyed</span>
            </div>
            <div className={styles.featureText}>
              <span className={styles.kicker}>Report, October 2026</span>
              <h3 className="h3">The Preparedness Index</h3>
              <p>
                How prepared do citizens feel for an uncertain world? A new international measure across twelve countries:
                which risks people expect, how ready they feel, and who they trust in a crisis.
              </p>
              <span className={styles.readOn}>Read on veriangroup.com</span>
            </div>
          </a>

          <a className={styles.feature} href={`${VERIAN}/news-and-insights/youth-voices-engaging-the-generation-shaping-tomorrow`} target="_blank" rel="noreferrer">
            <div className={styles.featureArtSmall} aria-hidden>
              <svg viewBox="0 0 240 40" className={styles.principles}>
                {Array.from({ length: 6 }, (_, i) => (
                  <g key={i} transform={`translate(${i * 40 + 4} 4)`}>
                    <path d="M16 2L30 30H2Z" style={{ ["--i" as string]: i }} />
                  </g>
                ))}
              </svg>
              <span className={styles.artNote}>Six principles</span>
            </div>
            <div className={styles.featureText}>
              <span className={styles.kicker}>Insight</span>
              <h3 className="h4">Youth Voices: engaging the generation shaping tomorrow</h3>
              <p>Decades of work with young people distilled into six principles for youth-centred, evidence-based policy.</p>
              <span className={styles.readOn}>Read on veriangroup.com</span>
            </div>
          </a>

          <a className={styles.feature} href={`${VERIAN}/news-and-insights/the-reykjavik-index-for-leadership`} target="_blank" rel="noreferrer">
            <div className={styles.featureArtSmall} aria-hidden>
              <svg viewBox="0 0 240 40" className={styles.timeline}>
                <line x1="4" y1="20" x2="236" y2="20" />
                {Array.from({ length: 9 }, (_, i) => (
                  <circle key={i} cx={4 + i * 29} cy="20" r={i === 0 ? 5 : 3.2} style={{ ["--i" as string]: i }} />
                ))}
              </svg>
              <span className={styles.artNote}>2018 to today</span>
            </div>
            <div className={styles.featureText}>
              <span className={styles.kicker}>Index</span>
              <h3 className="h4">The Reykjavik Index for Leadership</h3>
              <p>
                Since 2018, the first global measure of how suitable people think women and men are to lead, across the G7
                and more than 40 other countries.
              </p>
              <span className={styles.readOn}>Read on veriangroup.com</span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
