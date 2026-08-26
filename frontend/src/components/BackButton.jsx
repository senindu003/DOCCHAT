import { ArrowLeft } from "lucide-react";

const BackButton = ({ label = "Back to Home", onClick, className = "" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${className}`}
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    {label}
  </button>
);

export default BackButton;
