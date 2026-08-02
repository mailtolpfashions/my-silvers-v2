import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-20">
      <h1 className="mb-6 text-2xl font-semibold">Create an account</h1>
      <RegisterForm />
    </div>
  );
}
