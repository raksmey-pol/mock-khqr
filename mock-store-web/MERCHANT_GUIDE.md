# KHQR Card Component for Merchants

A production-ready, reusable React component for displaying KHQR payment cards on merchant websites, inspired by shadcn component patterns.

## 🚀 Quick Start

### 1. Copy the Component

Copy the `KhqrCard.tsx` file from this project to your React project:

```bash
# Copy to your components directory
cp KhqrCard.tsx your-project/components/
```

### 2. Install Dependency

Ensure you have `qrcode.react` installed:

```bash
npm install qrcode.react
# or
yarn add qrcode.react
# or
pnpm add qrcode.react
```

### 3. Use in Your Code

```tsx
import { KhqrCard } from "@/components/KhqrCard";

export default function PaymentPage() {
  return (
    <KhqrCard
      receiverName="Your Business Name"
      amount={50}
      currency="USD"
      qrData="https://your-payment-link.com/pay"
    />
  );
}
```

## 📋 Props Reference

```typescript
interface KhqrCardProps {
  /** Merchant/receiver name (required) */
  receiverName: string;

  /** Payment amount (optional) */
  amount?: number | string;

  /** Currency code e.g., 'USD', 'KHR' (default: 'USD') */
  currency?: string;

  /** QR code data - payment link or encoded data (required) */
  qrData: string;

  /** Card width in pixels (default: 280) */
  width?: number;

  /** Show logo at center of QR code (default: true) */
  showLogo?: boolean;

  /** Logo URL for QR code center (optional) */
  logoUrl?: string;

  /** Custom CSS class name (optional) */
  className?: string;
}
```

## 💡 Common Use Cases

### Invoice/Bill Display

```tsx
export function InvoicePreview({ invoice }) {
  return (
    <div className="invoice-container">
      <div className="invoice-details">
        <h1>Invoice #{invoice.id}</h1>
        {/* Invoice details */}
      </div>

      <KhqrCard
        receiverName={invoice.businessName}
        amount={invoice.totalAmount}
        currency={invoice.currency}
        qrData={`https://bakong.example.com/pay/${invoice.id}`}
        width={300}
      />
    </div>
  );
}
```

### E-commerce Checkout

```tsx
export function CheckoutPage({ cart }) {
  const generatePaymentQR = () => {
    const params = new URLSearchParams({
      merchant: cart.merchant,
      amount: cart.total,
      orderId: cart.orderId,
    });
    return `https://your-bank.com/pay?${params}`;
  };

  return (
    <div className="checkout">
      <h1>Complete Payment</h1>

      <KhqrCard
        receiverName={cart.merchant}
        amount={cart.total}
        currency="USD"
        qrData={generatePaymentQR()}
      />

      <p>Scan with any KHQR-compatible banking app</p>
    </div>
  );
}
```

### Dynamic Amount Input

```tsx
export function DynamicPayment() {
  const [amount, setAmount] = useState("");

  return (
    <div>
      <input
        type="number"
        placeholder="Enter amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <KhqrCard
        receiverName="My Store"
        amount={amount || 0}
        currency="KHR"
        qrData={`https://bakong.example.com/pay?amount=${amount}`}
      />
    </div>
  );
}
```

### Responsive Display

```tsx
export function ResponsiveKhqr() {
  const [cardWidth, setCardWidth] = useState(280);

  useEffect(() => {
    const updateWidth = () => {
      const width = window.innerWidth;
      if (width < 480) setCardWidth(240);
      else if (width < 768) setCardWidth(280);
      else setCardWidth(350);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return (
    <KhqrCard
      receiverName="Store"
      amount={50}
      currency="USD"
      qrData="https://bakong.example.com/pay"
      width={cardWidth}
    />
  );
}
```

### With Custom Logo

```tsx
<KhqrCard
  receiverName="My Business"
  amount={100}
  currency="USD"
  qrData="https://bakong.example.com/pay"
  width={300}
  showLogo={true}
  logoUrl="/path/to/my-logo.png"
/>
```

### Empty Amount State

```tsx
// Show "0 KHR" when no amount is specified
<KhqrCard
  receiverName="Store"
  amount={undefined}
  currency="KHR"
  qrData="https://bakong.example.com/pay"
/>

// Or explicitly pass 0
<KhqrCard
  receiverName="Store"
  amount={0}
  currency="KHR"
  qrData="https://bakong.example.com/pay"
/>
```

## 🎨 Design Specifications

All specifications from the official Bakong KHQR guideline are implemented:

### Dimensions

- **Aspect Ratio**: 20:29 (width:height)
- **Example**: 280px × 406px
- **Shadow**: 0 0 16px rgba(0,0,0,0.1)

### Spacing

- **Horizontal Margins**: 12% of card height
- **Vertical Margins**: 10% of card height
- **Header Height**: 8% of card height

### Typography

- **Font Family**: Nunito Sans (fallback to system fonts)
- **Receiver Name**: 3% of card height
- **Amount**: 6.5% of card height
- **Currency**: 3% of card height
- **Letter Spacing**: 0 (tight)

### Colors

| Element        | Hex     | Usage                      |
| -------------- | ------- | -------------------------- |
| **Bakong Red** | #E1232E | Header background, accents |
| **Black**      | #000000 | Text, lines                |
| **White**      | #FFFFFF | Card background            |

## 🔗 Integration Patterns

### With Next.js

```tsx
// app/payment/page.tsx
"use client";

import KhqrCard from "@/components/KhqrCard";

export default function PaymentPage() {
  return (
    <div className="payment-container">
      <KhqrCard
        receiverName="ACME Corp"
        amount={100}
        currency="USD"
        qrData="https://bakong.example.com/pay"
      />
    </div>
  );
}
```

### With React (CRA, Vite)

```tsx
// src/pages/Payment.tsx
import KhqrCard from "../components/KhqrCard";

export function Payment() {
  return (
    <KhqrCard
      receiverName="Store Name"
      amount={50}
      currency="USD"
      qrData="https://bakong.example.com/pay"
    />
  );
}
```

### With TypeScript

```tsx
import KhqrCard, { KhqrCardProps } from "@/components/KhqrCard";

const paymentProps: KhqrCardProps = {
  receiverName: "My Store",
  amount: 100,
  currency: "KHR",
  qrData: "https://bakong.example.com/pay/abc123",
  width: 320,
};

export function PaymentCard() {
  return <KhqrCard {...paymentProps} />;
}
```

## 🛠️ Styling & Customization

The component uses inline styles for critical layout properties to ensure consistent display. You can add custom styling:

```tsx
// Add custom CSS
import "./custom-card.css";

<KhqrCard
  receiverName="Store"
  amount={50}
  currency="USD"
  qrData="https://bakong.example.com/pay"
  className="my-custom-card"
/>;
```

```css
/* custom-card.css */
.my-custom-card {
  margin: 20px auto;
  display: flex;
  justify-content: center;
}
```

### Container Styling

```tsx
<div
  style={{
    maxWidth: "400px",
    margin: "0 auto",
    padding: "20px",
    display: "flex",
    justifyContent: "center",
  }}
>
  <KhqrCard
    receiverName="Store"
    amount={50}
    currency="USD"
    qrData="https://bakong.example.com/pay"
  />
</div>
```

## 📱 Recommended Sizes

| Context           | Width     | Height    | Use Case         |
| ----------------- | --------- | --------- | ---------------- |
| **Mobile App**    | 240-280px | 348-406px | Payment screen   |
| **Invoice PDF**   | 300-320px | 435-464px | Bill display     |
| **Web Checkout**  | 300-350px | 435-507px | Desktop checkout |
| **POS Display**   | 200-250px | 290-362px | Quick checkout   |
| **Large Display** | 400-500px | 580-725px | Wall display     |

## ⚠️ QR Code Data Format

The `qrData` prop should contain valid KHQR-encoded payment information. Typical formats:

```tsx
// Simple payment link
qrData = "https://bakong.example.com/pay/merchant-id";

// With parameters
qrData = "https://bakong.example.com/pay?merchant=ID&amount=50&currency=USD";

// KHQR-encoded string (if using Bakong SDK)
qrData = "00020101021102..."; // Full KHQR encoded string
```

## 🔒 Security Notes

- The component generates QR codes client-side
- No sensitive data is transmitted
- QR data is URL-encoded in the component's internal generation
- Always use HTTPS for payment links in production

## 🌐 Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## 📦 Production Checklist

Before deploying to production:

- [ ] Test QR code scanning with multiple KHQR-compatible apps
- [ ] Verify responsive behavior on all target devices
- [ ] Test with various merchant names and amounts
- [ ] Ensure payment links are valid and secure (HTTPS)
- [ ] Add loading states if generating QR codes dynamically
- [ ] Test accessibility with screen readers
- [ ] Verify font loading (Nunito Sans fallback works)
- [ ] Set up error handling for invalid QR data

## 🐛 Troubleshooting

### QR Code Not Scanning

- ✅ Ensure `qrData` is a valid, encoded payment link
- ✅ Check that QR code size is sufficient (min 200x200px)
- ✅ Test with multiple scanning apps

### Sizing Issues

- ✅ Card aspect ratio is automatically maintained
- ✅ Use the `width` prop to adjust size
- ✅ All internal proportions scale from card height

### Typography Not Displaying

- ✅ Nunito Sans should load from system fonts
- ✅ Fallback fonts are: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
- ✅ For custom fonts, add to your project's `<head>`

## 💬 Support

For issues, questions, or feature requests:

1. Check the [KHQR Card Component Guide](./KHQR_COMPONENT_GUIDE.md)
2. Review [Bakong KHQR Specifications](https://bakong.gov.kh)
3. Test your implementation in the demo: `/khqr-demo`

## 📄 License

This component implements the Bakong KHQR specification for payment card display.

---

**Version**: 1.0.0  
**Last Updated**: March 2026  
**Bakong KHQR Guideline Compliance**: ✅ Full
