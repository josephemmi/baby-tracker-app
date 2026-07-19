export default function Loading() {
  return (
    <div className="min-h-screen bg-paper p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl animate-pulse flex-col gap-6">
        <div className="h-16 rounded-[10px] bg-paper-raised" />
        <div className="h-20 rounded-[10px] bg-paper-raised" />
        <div className="h-64 rounded-[10px] bg-paper-raised" />
      </div>
    </div>
  );
}
