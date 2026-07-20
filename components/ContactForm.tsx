"use client";

import { useState, type FormEvent } from "react";
import { businessConfig } from "@/lib/config";

type FormState = {
  name: string;
  email: string;
  phone: string;
  location: string;
  message: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialState: FormState = {
  name: "",
  email: "",
  phone: "",
  location: "",
  message: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactForm() {
  const [values, setValues] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};
    if (!values.name.trim()) nextErrors.name = "Please enter your name.";
    if (!values.email.trim()) {
      nextErrors.email = "Please enter your email.";
    } else if (!emailPattern.test(values.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!values.message.trim()) nextErrors.message = "Please enter a message.";
    return nextErrors;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitted(false);
      return;
    }

    // DEVELOPER NOTE: This first draft uses an honest mailto fallback so the
    // form works without a backend or API key. Before launch, connect a
    // production form provider (e.g. Formspree, Resend, or a serverless API
    // route) and replace the block below with a real submission call, while
    // keeping the same client-side validation above.
    const subject = encodeURIComponent(`New website inquiry from ${values.name}`);
    const bodyLines = [
      `Name: ${values.name}`,
      `Email: ${values.email}`,
      values.phone ? `Phone: ${values.phone}` : null,
      values.location ? `Address / neighborhood: ${values.location}` : null,
      "",
      "Message:",
      values.message,
    ].filter((line): line is string => line !== null);
    const body = encodeURIComponent(bodyLines.join("\n"));

    window.location.href = `mailto:${businessConfig.email}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  const inputClasses =
    "mt-1.5 w-full rounded-lg border border-soft-gray bg-pure-white px-4 py-2.5 text-charcoal placeholder:text-warm-text/60 focus:border-deep-green";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="text-sm font-medium text-charcoal">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          value={values.name}
          onChange={(event) => updateField("name", event.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
          className={inputClasses}
        />
        {errors.name && (
          <p id="contact-name-error" className="mt-1 text-sm text-red-700">
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-email" className="text-sm font-medium text-charcoal">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => updateField("email", event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
          className={inputClasses}
        />
        {errors.email && (
          <p id="contact-email-error" className="mt-1 text-sm text-red-700">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-phone" className="text-sm font-medium text-charcoal">
          Phone <span className="text-warm-text font-normal">(optional)</span>
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(event) => updateField("phone", event.target.value)}
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="contact-location" className="text-sm font-medium text-charcoal">
          Address or neighborhood <span className="text-warm-text font-normal">(optional)</span>
        </label>
        <input
          id="contact-location"
          name="location"
          type="text"
          value={values.location}
          onChange={(event) => updateField("location", event.target.value)}
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="text-sm font-medium text-charcoal">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          value={values.message}
          onChange={(event) => updateField("message", event.target.value)}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          className={inputClasses}
        />
        {errors.message && (
          <p id="contact-message-error" className="mt-1 text-sm text-red-700">
            {errors.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-full bg-deep-green px-7 py-3.5 text-sm font-medium tracking-wide text-pure-white transition-colors duration-200 hover:bg-charcoal"
      >
        Send Message
      </button>

      {submitted && (
        <p role="status" className="text-sm text-deep-green">
          Your email app should now be open with your message ready to send to{" "}
          {businessConfig.email}.
        </p>
      )}
    </form>
  );
}
