import type { Metadata } from "next";
import { StaticMap } from "@/components/pages/StaticMap";
import { COUNTRY_COUNT, OFFICE_COUNT, OFFICES, REGIONS } from "@/data/offices";
import { LINKS } from "@/data/site";
import styles from "@/components/pages/Pages.module.css";

export const metadata: Metadata = {
  title: "About us",
  description: "Verian's purpose, history and offices.",
};

const REGION_NAME = { Europe: "Europe", APAC: "Asia-Pacific", "North America": "North America" } as const;

const TIMELINE = [
  { when: "1940s", what: "Research for the UK government on the impact of wartime rationing, where the story begins." },
  { when: "2016", what: "Kantar Public formed as the public policy division of Kantar." },
  { when: "September 2022", what: "Kantar Public was divested from Kantar Group and became an independent business." },
  { when: "9 November 2023", what: "Kantar Public became Verian, across Europe, Asia-Pacific and the US." },
  { when: "Today", what: `${OFFICE_COUNT} offices in ${COUNTRY_COUNT} countries, including PPMI in Vilnius.` },
];

export default function AboutPage() {
  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <h1 className="h1">
            Helping solve the next generation of public policy challenges
          </h1>
          <p className={`lede ${styles.heroLede}`}>
            Verian is a purpose-led, independent research, evidence, evaluation and communications agency for governments
            and the public realm. Specialist consultants and researchers, backed by a global data ecosystem, provide
            gold-standard data on the economy and society to the people who make decisions.
          </p>
        </div>
      </section>

      <section className={`section ${styles.purposeBand}`} id="purpose" aria-labelledby="purpose-title">
        <div className="container">
          <div className={styles.purpose}>
            <h2 id="purpose-title" className="h2">
              Powering decisions that shape the world.
            </h2>
            <ul role="list" className={styles.purposeList}>
              <li>Rapid policy thinking when a moment is urgent.</li>
              <li>Policies implemented on the ground for multilateral organisations.</li>
              <li>Communications built to reach diverse and complex audiences.</li>
              <li>Global best practice, delivered through local expertise.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="name-title">
        <div className={`container ${styles.split}`}>
          <div>
            <h2 id="name-title" className="h3">
              Why “Verian”
            </h2>
            <p className="prose">
              The name joins Latin roots for “truth” and “the qualities of”: a reminder that the job is bringing evidence and
              insight to public policy and decision-making.{" "}
              <a className="link" href={LINKS.rebrand} target="_blank" rel="noreferrer">
                Read the announcement
              </a>
              .
            </p>
          </div>
          <ol className={styles.timeline}>
            {TIMELINE.map((t) => (
              <li key={t.when}>
                <span className={styles.when}>{t.when}</span>
                <span className={styles.what}>{t.what}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`section ${styles.locationsBand}`} id="locations" aria-labelledby="locations-title">
        <div className="container">
          <div className={styles.locHead}>
            <h2 id="locations-title" className="h2">
              Where we work
            </h2>
            <p className="lede">
              Teams across many time zones share global best practice and deliver through local expertise.
            </p>
          </div>
          <div className={styles.mapFrame}>
            <StaticMap />
          </div>
          <div className={styles.regions}>
            {REGIONS.map((r) => (
              <div key={r}>
                <h3 className="h4">{REGION_NAME[r]}</h3>
                <ul role="list" className={styles.offices}>
                  {OFFICES.filter((o) => o.region === r).map((o) => (
                    <li key={o.city}>
                      <span className={styles.city}>
                        {o.city}
                        {o.note ? <span className={styles.cityNote}> {o.note}</span> : null}
                      </span>
                      <span className={styles.addr}>{o.address}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className={styles.footnote}>
            Addresses from{" "}
            <a className="link" href={LINKS.locations} target="_blank" rel="noreferrer">
              Verian&rsquo;s locations page
            </a>
            , October 2026. For enquiries, use{" "}
            <a className="link" href={LINKS.contact} target="_blank" rel="noreferrer">
              Verian&rsquo;s contact form
            </a>
            .
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="more-title">
        <div className={`container ${styles.moreLinks}`}>
          <h2 id="more-title" className="h3">
            More about Verian
          </h2>
          <ul role="list">
            <li>
              <a href={LINKS.leadership} target="_blank" rel="noreferrer">
                <span className={styles.moreTitle}>Global leadership</span>
                <span className={styles.moreText}>Regional and country leaders alongside subject experts.</span>
              </a>
            </li>
            <li>
              <a href={LINKS.institute} target="_blank" rel="noreferrer">
                <span className={styles.moreTitle}>Verian Institute for Public Impact</span>
                <span className={styles.moreText}>Brings citizen insight to government and civil society, convening in Brussels, London, Berlin, Paris and Canberra.</span>
              </a>
            </li>
            <li>
              <a href={LINKS.centres} target="_blank" rel="noreferrer">
                <span className={styles.moreTitle}>Centres of Excellence</span>
                <span className={styles.moreText}>Eleven centres, from climate and gender to technology and society, sharing best practice across countries.</span>
              </a>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
