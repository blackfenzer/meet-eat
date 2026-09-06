import { CreateSessionForm } from "@/components/create-session-form";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
      <header className="rise">
        <p className="text-xs uppercase tracking-[0.16em] text-umber">Meet &amp; Eat</p>
        <h1 className="mt-5 text-4xl sm:text-5xl">
          Find the hour everyone is free,
          <span className="italic text-brick"> then settle what to eat.</span>
        </h1>
        <p className="mt-5 max-w-xl text-umber">
          Set the days and hours worth considering, send one link, and let everyone
          paint in when they are free and rank the places they would actually go.
          No accounts — a name and a four-digit PIN is the whole login.
        </p>
      </header>

      <section className="mt-14">
        <CreateSessionForm />
      </section>
    </main>
  );
}
