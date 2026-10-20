import { Container } from "@/components/ui/Container";
import { stats, type Stat } from "@/content/home";

const TITLE_ID = "stats-title";

function StatItem({ stat }: { stat: Stat }) {
  return (
    // flex-col-reverse：數字視覺在前，語意仍維持 <dt>→<dd> 順序
    <div className="flex flex-col-reverse justify-end rounded-md border border-stroke bg-white px-5 py-6 lg:px-6 lg:py-8">
      <dt className="mt-3 text-sm leading-relaxed text-balance text-slate-600">
        {stat.label}
      </dt>
      <dd>
        <span aria-hidden="true" className="block h-0.5 w-8 bg-brand-600" />
        <span className="mt-5 block text-4xl leading-none font-light tracking-tight whitespace-nowrap text-brand-900 tabular-nums sm:text-5xl lg:text-6xl">
          {stat.prefix ? (
            <span
              lang="en"
              className="mr-2 text-base font-semibold tracking-[0.12em] text-champagne-700"
            >
              {stat.prefix}
            </span>
          ) : null}
          {stat.value}
          {stat.suffix ? (
            <span className="ml-0.5 text-xl tracking-normal text-champagne-700 lg:text-2xl">
              {stat.suffix}
            </span>
          ) : null}
        </span>
      </dd>
    </div>
  );
}

/** 關鍵數據指標：白底四格細框數據卡（數據待招生單位佐證，見 home.ts 的 TODO）。 */
export function StatStrip() {
  return (
    <section aria-labelledby={TITLE_ID} className="bg-white py-12 lg:py-16">
      <h2 id={TITLE_ID} className="sr-only">
        關鍵數據指標
      </h2>
      <Container>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {stats.map((stat) => (
            <StatItem key={stat.label} stat={stat} />
          ))}
        </dl>
      </Container>
    </section>
  );
}
