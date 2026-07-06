interface ErrorMessageProps {
  message: string
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-6 text-right text-2xl font-mono text-red-500"
    >
      {message}
    </div>
  )
}
