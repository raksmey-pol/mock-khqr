"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";

export interface KhqrCardProps {
  receiverName: string;
  amount?: number | string;
  currency?: string;
  qrData: string;
  width?: number;
  showLogo?: boolean;
  logoUrl?: string;
  khqrLogoUrl?: string;
  scanDisabled?: boolean;
  disabledLabel?: string;
  className?: string;
}

const KhqrCard = React.forwardRef<HTMLDivElement, KhqrCardProps>(
  (
    {
      receiverName,
      amount,
      currency = "USD",
      qrData,
      width = 280,
      showLogo = true,
      logoUrl,
      khqrLogoUrl,
      scanDisabled = false,
      disabledLabel = "CLOSED",
      className = "",
    },
    ref,
  ) => {
    const cardWidth = width;
    const cardHeight = (cardWidth * 29) / 20;

    const marginLR = (cardHeight * 12) / 100;
    const marginTB = (cardHeight * 10) / 100;
    const headerHeight = (cardHeight * 8) / 100;
    const nameSize = (cardHeight * 3.5) / 100;
    const amountSize = (cardHeight * 6.5) / 100;
    const currencySize = (cardHeight * 3) / 100;

    const qrSize = cardWidth * 0.65;

    const normalizedAmount = amount ?? "";
    const formattedAmount = (() => {
      if (normalizedAmount === "") {
        return "0.00";
      }

      if (
        typeof normalizedAmount === "number" &&
        Number.isFinite(normalizedAmount)
      ) {
        return normalizedAmount.toFixed(2);
      }

      const parsedAmount = Number(normalizedAmount);
      return Number.isFinite(parsedAmount)
        ? parsedAmount.toFixed(2)
        : normalizedAmount.toString();
    })();

    const resolvedKhqrLogoUrl = khqrLogoUrl || "/khqr/khqr-logo-red.png";
    const resolvedQrLogoUrl = logoUrl || "/khqr/bakong-logo.png";

    return (
      <div
        ref={ref}
        className={`khqr-card-container ${className}`}
        style={{
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          backgroundColor: "#FFFFFF",
          borderRadius: "24px",
          boxShadow: "0 0 16px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily:
            '"Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          letterSpacing: 0,
        }}
      >
        <div
          style={{
            height: `${headerHeight}px`,
            backgroundColor: "#E1232E",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={resolvedKhqrLogoUrl}
            alt="KHQR logo"
            style={{
              height: `${headerHeight * 0.58}px`,
              width: "auto",
              maxWidth: "72%",
              objectFit: "contain",
              display: "block",
              filter: "brightness(0) invert(1)",
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: `${marginTB}px ${marginLR}px`,
            justifyContent: "space-between",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div
              style={{
                fontSize: `${nameSize}px`,
                fontWeight: 500,
                color: "#000000",
                lineHeight: "1.2",
                textAlign: "left",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {receiverName}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "6px",
              }}
            >
              <div
                className="gap"
                style={{
                  display: "flex",
                  alignItems:
                    "baseline" /* Aligns the text on the same baseline */,
                  gap: "8px" /* Adjust this value to increase/decrease the space */,
                }}
              >
                <span
                  style={{
                    fontSize: `${amountSize}px`,
                    fontWeight: 700,
                    color: "#000000",
                    lineHeight: "1.2",
                  }}
                >
                  {formattedAmount}
                </span>

                <span
                  style={{
                    fontSize: `${currencySize}px`,
                    fontWeight: 400,
                    color: "#000000",
                    lineHeight: "1.2",
                  }}
                >
                  {currency}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              height: 0,
              borderTop: "1px dashed #999999",
              margin: `${marginTB * 0.5}px -${marginLR}px`,
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {scanDisabled ? (
              <div
                style={{
                  width: `${qrSize}px`,
                  height: `${qrSize}px`,
                  borderRadius: "16px",
                  border: "2px dashed #c7c7c7",
                  backgroundColor: "#f6f6f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "14px",
                }}
              >
                <span
                  style={{
                    fontSize: `${Math.max(currencySize * 1.35, 12)}px`,
                    fontWeight: 700,
                    color: "#666666",
                    letterSpacing: "0.06em",
                  }}
                >
                  {disabledLabel}
                </span>
              </div>
            ) : (
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                }}
              >
                <QRCodeSVG
                  value={qrData}
                  size={qrSize}
                  level="H"
                  marginSize={0}
                />

                {showLogo && resolvedQrLogoUrl && (
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      width: `${qrSize * 0.18}px`,
                      height: `${qrSize * 0.18}px`,
                      backgroundColor: "#E1232E",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "3px solid white",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={resolvedQrLogoUrl}
                      alt="Bakong logo"
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

KhqrCard.displayName = "KhqrCard";

export default KhqrCard;
