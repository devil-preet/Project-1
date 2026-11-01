import Link from "next/link";

export default function StoreNotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm opacity-70">It may have been removed, or the store isn&apos;t available right now.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline">Back to home</Link>
    </div>
  );
}
