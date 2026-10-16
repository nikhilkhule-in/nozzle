export function PageHead({ title, meta }: { title: string; meta?: React.ReactNode }) {
  return (
    <div className="top">
      <h1>{title}</h1>
      <div className="top-meta">{meta}</div>
    </div>
  );
}
