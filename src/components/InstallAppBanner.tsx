import React, { useEffect, useState } from "react";
import OduzzLogo from "./OduzzLogo";
import "./InstallAppBanner.css";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const InstallAppBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [isIosDevice, setIsIosDevice] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  useEffect(() => {
    // Check if app is already running in standalone (PWA) mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    setIsIosDevice(isIos);

    const isDismissed = sessionStorage.getItem("oduzz_pwa_dismissed");
    if (!isDismissed && isIos) {
      setShowBanner(true);
    }

    // Android / Desktop Chrome / Edge beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIosDevice) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem("oduzz_pwa_dismissed", "true");
  };

  if (isInstalled || (!showBanner && !showIosGuide)) {
    return null;
  }

  return (
    <>
      {showBanner && (
        <aside className="oduzz-pwa-banner" aria-label="Install Oduzz OS mobile app">
          <div className="pwa-banner-content">
            <div className="pwa-banner-logo">
              <OduzzLogo size={32} variant="icon" />
            </div>
            <div className="pwa-banner-text">
              <h4 className="pwa-banner-title">Download Oduzz OS App</h4>
              <p className="pwa-banner-desc">
                Install directly on your phone for instant, full-screen smart control.
              </p>
            </div>
          </div>

          <div className="pwa-banner-actions">
            <button className="pwa-install-btn" onClick={handleInstallClick}>
              📲 {isIosDevice ? "How to Install" : "Install App"}
            </button>
            <button
              className="pwa-close-btn"
              onClick={handleDismiss}
              aria-label="Dismiss install banner"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* iOS Installation Instruction Modal Sheet */}
      {showIosGuide && (
        <div className="pwa-ios-modal-overlay" onClick={() => setShowIosGuide(false)}>
          <div className="pwa-ios-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-ios-header">
              <OduzzLogo size={38} variant="icon" />
              <h3>Install Oduzz on iPhone / iPad</h3>
              <button className="pwa-modal-close" onClick={() => setShowIosGuide(false)}>
                ✕
              </button>
            </div>

            <p className="pwa-ios-intro">
              Install <strong>Oduzz OS</strong> to your home screen directly through Safari:
            </p>

            <ol className="pwa-ios-steps">
              <li>
                <span className="step-num">1</span>
                <div>
                  Tap the <strong>Share</strong> button at the bottom of Safari:
                  <span className="step-icon"> ⎋ (Share)</span>
                </div>
              </li>
              <li>
                <span className="step-num">2</span>
                <div>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>:
                  <span className="step-icon"> ➕ (Add)</span>
                </div>
              </li>
              <li>
                <span className="step-num">3</span>
                <div>
                  Tap <strong>"Add"</strong> in the top-right corner to finish!
                </div>
              </li>
            </ol>

            <button className="pwa-ios-confirm-btn" onClick={() => setShowIosGuide(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallAppBanner;
