import Link from "next/link";
import { LINKS } from "@/data/site";
import { COUNTRY_COUNT, OFFICE_COUNT } from "@/data/offices";
import { HeroOverlay } from "./HeroOverlay";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero} data-scene="hero" aria-labelledby="hero-title">
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy} data-hero-copy>
          <h1 id="hero-title" className={`display ${styles.title}`}>
            Powering decisions that shape the world.
          </h1>
          <p className={`lede ${styles.lede}`}>
            Verian is an independent research, evidence, evaluation and communications agency for governments and the
            public realm, with {OFFICE_COUNT} offices in {COUNTRY_COUNT} countries.
          </p>
          <div className={styles.actions}>
            <a className="btn" href={LINKS.contact} target="_blank" rel="noreferrer">
              Work with us
            </a>
            <Link className="btn btn--ghost" href="#ask">
              Ask our library
            </Link>
          </div>
        </div>
      </div>
      <HeroOverlay />
    </section>
  );
}
