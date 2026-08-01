import { Link, useRouter } from "@tanstack/react-router";

export function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <h2 className="text-xl font-semibold">Не удалось загрузить данные</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <h2 className="text-xl font-semibold">Не найдено</h2>
        <p className="mt-2 text-sm text-muted-foreground">Такой страницы или материала нет.</p>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          На главную
        </Link>
      </div>
    </div>
  );
}
