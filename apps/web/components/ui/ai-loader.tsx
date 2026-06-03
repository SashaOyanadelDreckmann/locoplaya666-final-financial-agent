"use client";

import * as React from "react";

type AiLoaderProps = {
  size?: number;
  text?: string;
  subtitle?: string;
};

export function AiLoader({
  size = 176,
  text = "Generando diagnostico",
  subtitle = "Integrando entrevista, intake, productos y presupuesto.",
}: AiLoaderProps) {
  const letters = text.split("");

  return (
    <div className="ai-loader-shell" role="status" aria-live="polite" aria-busy="true">
      <div className="ai-loader-center">
        <div
          className="ai-loader-orbit"
          style={{ width: size, height: size }}
          aria-hidden="true"
        >
          <div className="ai-loader-ring" />
          <div className="ai-loader-glow" />
          <div className="ai-loader-copy">
            <span className="ai-loader-kicker">Financieramente</span>
            <div className="ai-loader-wordmark">
              {letters.map((letter, index) => (
                <span
                  key={`${letter}-${index}`}
                  className="ai-loader-letter"
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  {letter === " " ? "\u00A0" : letter}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="ai-loader-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}
