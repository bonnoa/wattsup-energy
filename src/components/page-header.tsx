export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[26px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance lg:text-[30px]">
        {title}
      </h1>
      <p className="text-[13px] text-muted text-pretty">{subtitle}</p>
    </div>
  );
}
