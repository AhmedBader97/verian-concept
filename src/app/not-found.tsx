import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section" style={{ paddingTop: "calc(var(--header-h) + 96px)", minHeight: "70vh" }}>
      <div className="container" style={{ display: "grid", gap: 24, justifyItems: "start" }}>
        <h1 className="h1">This page isn&rsquo;t here</h1>
        <p className="lede">The link may be out of date. The library might have what you were looking for.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="btn" href="/insights/">
            Search the library
          </Link>
          <Link className="btn btn--ghost" href="/">
            Go to the home page
          </Link>
        </div>
      </div>
    </section>
  );
}
