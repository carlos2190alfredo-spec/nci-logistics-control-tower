import { LoginForm } from "@/components/login-form";
import { Card } from "@/components/ui";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Acceso local</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">NCI Logistics Control Tower</h1>
        <p className="mt-2 text-sm text-slate-600">Sesion opaca local con cookie httpOnly y roles verificados en servidor.</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </Card>
    </main>
  );
}
