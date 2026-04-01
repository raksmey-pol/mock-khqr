"use client";

import { useState } from "react";
import { KhqrCard } from "@/components";

export default function KhqrDemoPage() {
  const [merchantName, setMerchantName] = useState("POL RAKSMEY");
  const [amount, setAmount] = useState(50);
  const [currency, setCurrency] = useState("USD");
  const [width, setWidth] = useState(280);

  const qrData = `https://bakong.example.com/pay/${merchantName}?amount=${amount}&currency=${currency}`;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
        padding: "40px 20px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "40px" }}>
          <h1
            style={{
              fontSize: "32px",
              fontWeight: 700,
              marginBottom: "8px",
              color: "#000",
            }}
          >
            KHQR Card Component
          </h1>
          <p style={{ fontSize: "16px", color: "#666", marginBottom: "20px" }}>
            A reusable KHQR payment card component for merchants. Customize and
            preview below.
          </p>
        </div>

        {/* Controls and Preview */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "40px",
            marginBottom: "40px",
          }}
        >
          {/* Controls */}
          <div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                marginBottom: "20px",
                color: "#000",
              }}
            >
              Configuration
            </h2>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              {/* Merchant Name */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "8px",
                    color: "#333",
                  }}
                >
                  Merchant/Receiver Name
                </label>
                <input
                  type="text"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Amount */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "8px",
                    color: "#333",
                  }}
                >
                  Amount
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Currency */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "8px",
                    color: "#333",
                  }}
                >
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    boxSizing: "border-box",
                  }}
                >
                  <option>USD</option>
                  <option>KHR</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>JPY</option>
                  <option>CNY</option>
                </select>
              </div>

              {/* Width */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "8px",
                    color: "#333",
                  }}
                >
                  Card Width: {width}px
                </label>
                <input
                  type="range"
                  min="200"
                  max="500"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Info Box */}
              <div
                style={{
                  backgroundColor: "#f0f4ff",
                  border: "1px solid #d0deff",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "13px",
                  color: "#555",
                  lineHeight: "1.6",
                }}
              >
                <strong>Quick Tips:</strong>
                <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
                  <li>Aspect ratio: 20:29 (automatically calculated)</li>
                  <li>Dimensions scale smoothly with card width</li>
                  <li>QR code is scannable by any KHQR-compatible app</li>
                  <li>Left-aligned for quick 0.5s readability</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#fff",
              padding: "40px 20px",
              borderRadius: "12px",
              border: "1px solid #eee",
            }}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                marginBottom: "30px",
                color: "#000",
                textAlign: "center",
              }}
            >
              Live Preview
            </h2>
            <KhqrCard
              receiverName={merchantName}
              amount={amount}
              currency={currency}
              qrData={qrData}
              width={width}
            />
          </div>
        </div>

        {/* Usage Example */}
        <div
          style={{
            backgroundColor: "#fff",
            border: "1px solid #eee",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "40px",
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              marginBottom: "16px",
              color: "#000",
            }}
          >
            Implementation Example
          </h2>
          <pre
            style={{
              backgroundColor: "#f5f5f5",
              padding: "16px",
              borderRadius: "8px",
              overflow: "auto",
              fontSize: "13px",
              lineHeight: "1.6",
              color: "#333",
            }}
          >
            {`import { KhqrCard } from '@/components';

export default function CheckoutPage() {
  return (
    <KhqrCard
      receiverName="${merchantName}"
      amount={${amount}}
      currency="${currency}"
      qrData="https://bakong.example.com/pay/merchant123"
      width={${width}}
    />
  );
}`}
          </pre>
        </div>

        {/* Features Grid */}
        <div>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              marginBottom: "16px",
              color: "#000",
            }}
          >
            Features
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "16px",
            }}
          >
            {[
              {
                title: "📐 Precise Dimensions",
                desc: "Follows Bakong KHQR 20:29 aspect ratio with exact margins",
              },
              {
                title: "🔤 Typography",
                desc: "Nunito Sans with responsive sizing based on card height",
              },
              {
                title: "🎨 Brand Colors",
                desc: "Uses official Bakong red (#E1232E) and proper styling",
              },
              {
                title: "📱 Responsive",
                desc: "Scales perfectly on mobile, tablet, and desktop displays",
              },
              {
                title: "⚡ Fast QR",
                desc: "Left-aligned design for quick 0.5s readability",
              },
              {
                title: "♿ Accessible",
                desc: "Semantic HTML, proper contrast, keyboard friendly",
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: "#f9f9f9",
                  border: "1px solid #eee",
                  borderRadius: "8px",
                  padding: "16px",
                }}
              >
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "#000",
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{ fontSize: "13px", color: "#666", lineHeight: "1.5" }}
                >
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
