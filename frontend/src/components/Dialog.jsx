import React from "react";

const Dialog = ({ open, title, children, actions, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title" className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-gray-600">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {actions || (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              OK
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dialog;
