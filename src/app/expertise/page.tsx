import type { Metadata } from "next";
import Link from "next/link";
import { PolicyCycle } from "@/components/expertise/PolicyCycle";
import { EXPERTISE } from "@/data/expertise";
import { LINKS } from "@/data/site";
import styles from "@/components/expertise/Expertise.module.css";

export const metadata: Metadata = {
  title: "Expertise",
  description: "Verian's six areas of expertise, placed on the public policy cycle.",
};

export default function ExpertisePage() {
  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <h1 className="h1">
            Expertise across the whole policy cycle
          </h1>
          <p className={`lede ${styles.heroLede}`}>
            Verian works at the intersection of data, technology and citizen insight, from the first question about a problem
            to the evaluation of what a policy changed. Here is where each area of expertise does its work.
          </p>
        </div>
      </section>
      <section className={styles.cycleBand}>
        <div className="container">
          <PolicyCycle />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <ul role="list" className={styles.areas}>
            {EXPERTISE.map((e) => (
              <li key={e.slug}>
                <Link href={`/expertise/${e.slug}/`} className={styles.area}>
                  <h2 className="h3">{e.name}</h2>
                  <p>{e.short}</p>
                  <span className={styles.more}>About {e.name.toLowerCase()}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className={styles.centres}>
            <h2 className="h4">Centres of Excellence</h2>
            <p>
              Specialist teams that share methods and best practice across Verian&rsquo;s countries.{" "}
              <a className="link" href={LINKS.centres} target="_blank" rel="noreferrer">
                Read about them on veriangroup.com
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
