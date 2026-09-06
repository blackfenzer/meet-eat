const swatches = [
  { name: "maroon", className: "bg-maroon" },
  { name: "brick", className: "bg-brick" },
  { name: "cream", className: "bg-cream" },
  { name: "taupe", className: "bg-taupe" },
  { name: "umber", className: "bg-umber" },
];

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Meet &amp; Eat</h1>
      <div className="mt-4 flex gap-2">
        {swatches.map((s) => (
          <div key={s.name} className="flex flex-col items-center gap-1">
            <div
              className={`h-16 w-16 rounded border border-black/10 ${s.className}`}
            />
            <span className="text-xs">{s.name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
