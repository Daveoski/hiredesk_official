"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type GoogleCredentialResponse = { credential?: string };
type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number }) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export function GoogleSignInButton({
  onCredential,
  disabled = false,
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const buttonRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const [message, setMessage] = useState("");

  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled || !buttonRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) onCredentialRef.current(response.credential);
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: Math.max(250, Math.floor(buttonRef.current.getBoundingClientRect().width)),
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if (window.google) {
      renderGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton);
    } else {
      const script = document.createElement("script");
      script.src = GOOGLE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = renderGoogleButton;
      script.onerror = () => setMessage("Google sign-in could not load. Check your connection and try again.");
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existingScript?.removeEventListener("load", renderGoogleButton);
    };
  }, [clientId]);

  if (!clientId) {
    return (
      <div className="mb-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full justify-center gap-2"
          disabled={disabled}
          onClick={() => setMessage("Google sign-in needs NEXT_PUBLIC_GOOGLE_CLIENT_ID in frontend/.env.local and GOOGLE_AUTH_ENABLED=true plus GOOGLE_CLIENT_ID in backend/.env.")}
        >
          Continue with Google
        </Button>
        {message && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div ref={buttonRef} className={disabled ? "pointer-events-none opacity-50" : "min-h-10"} />
      {message && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{message}</p>}
    </div>
  );
}
