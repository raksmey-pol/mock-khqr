# KHQR Card Component Guide

A reusable React component for displaying KHQR payment cards following Bakong guidelines.

## Installation

The component is available in `components/KhqrCard.tsx` and can be imported as a standard React component.

## Basic Usage

```tsx
import { KhqrCard } from "@/components";

export default function PaymentPage() {
  return (
    <KhqrCard
      receiverName="POL RAKSMEY"
      amount={50}
      currency="USD"
      qrData="https://bakong.example.com/pay/merchant123"
    />
  );
}
```

## Props

| Prop           | Type               | Required | Default | Description                                 |
| -------------- | ------------------ | -------- | ------- | ------------------------------------------- |
| `receiverName` | `string`           | ✅       | -       | Merchant/receiver name                      |
| `amount`       | `number \| string` | ❌       | -       | Payment amount                              |
| `currency`     | `string`           | ❌       | `'USD'` | Currency code (e.g., 'USD', 'KHR')          |
| `qrData`       | `string`           | ✅       | -       | QR code data (payment link or encoded data) |
| `width`        | `number`           | ❌       | `280`   | Card width in pixels                        |
| `showLogo`     | `boolean`          | ❌       | `true`  | Show logo at center of QR code              |
| `logoUrl`      | `string`           | ❌       | -       | Logo URL for QR code center                 |
| `className`    | `string`           | ❌       | -       | Custom CSS class name                       |

## Advanced Examples

### Dynamic Amount Handling

```tsx
import { KhqrCard } from "@/components";
import { useState } from "react";

export default function DynamicPayment() {
  const [amount, setAmount] = useState<number | null>(null);

  return (
    <div>
      <input
        type="number"
        value={amount || ""}
        onChange={(e) =>
          setAmount(e.target.value ? Number(e.target.value) : null)
        }
        placeholder="Enter amount"
      />
      <KhqrCard
        receiverName="MY BUSINESS"
        amount={amount || 0}
        currency="KHR"
        qrData={`https://bakong.example.com/pay?amount=${amount}`}
        width={300}
      />
    </div>
  );
}
```

### With Custom Logo

```tsx
<KhqrCard
  receiverName="ACME CORP"
  amount={100}
  currency="USD"
  qrData="https://bakong.example.com/pay/acme123"
  width={320}
  showLogo={true}
  logoUrl="/path/to/logo.png"
/>
```

### Different Sizes

```tsx
// Mobile-optimized (smaller)
<KhqrCard
  receiverName="Store"
  amount={25}
  currency="USD"
  qrData="https://bakong.example.com/pay"
  width={240}
/>

// Desktop display (larger)
<KhqrCard
  receiverName="Store"
  amount={25}
  currency="USD"
  qrData="https://bakong.example.com/pay"
  width={400}
/>
```

## Design Specifications

### Dimensions

- **Aspect ratio**: 20:29 (e.g., 280px width → 406px height)
- **Shadow**: x=0, y=0, blur=16, color #000000, opacity 10%
- **Margins**: 12% height (left/right), 10% height (top/bottom)

### Typography

- **Font**: Nunito Sans
- **Receiver Name**: 3% of card height
- **Amount**: 6.5% of card height
- **Currency**: 3% of card height

### Colors

| Element       | Hex     | RGB                |
| ------------- | ------- | ------------------ |
| Header/Accent | #E1232E | RGB(225, 35, 46)   |
| Text          | #000000 | RGB(0, 0, 0)       |
| Background    | #FFFFFF | RGB(255, 255, 255) |

## Empty Amount State

When no amount is provided:

- Shows `0` with the currency code
- Example: "0 USD"

To show only currency without amount:

```tsx
<KhqrCard
  receiverName="Store"
  amount={undefined}
  currency="USD"
  qrData="https://bakong.example.com/pay"
/>
```

## Responsive Behavior

The component accepts a `width` prop to control card dimensions. All internal proportions scale automatically:

```tsx
// Responsive implementation
import { useState, useEffect } from "react";

export default function ResponsiveKhqr() {
  const [cardWidth, setCardWidth] = useState(280);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 400) setCardWidth(240);
      else if (width < 768) setCardWidth(280);
      else setCardWidth(350);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <KhqrCard
      receiverName="MY STORE"
      amount={50}
      currency="USD"
      qrData="https://bakong.example.com/pay"
      width={cardWidth}
    />
  );
}
```

## Integration with Checkout Flow

```tsx
import { KhqrCard } from "@/components";

export default function CheckoutPage() {
  const [order, setOrder] = useState({
    merchant: "POL RAKSMEY",
    amount: 50,
    currency: "USD",
  });

  const qrPaymentLink = `https://bakong.example.com/pay/${order.merchant}?amount=${order.amount}&currency=${order.currency}`;

  return (
    <div className="checkout-container">
      <h1>Complete Payment</h1>
      <KhqrCard
        receiverName={order.merchant}
        amount={order.amount}
        currency={order.currency}
        qrData={qrPaymentLink}
        width={300}
      />
      <p>
        Scan the QR code to pay {order.amount} {order.currency}
      </p>
    </div>
  );
}
```

## Styling & Customization

The component uses inline styles for all critical layout and styling to ensure consistent appearance. You can add custom CSS classes via the `className` prop:

```tsx
<KhqrCard
  receiverName="Store"
  amount={50}
  currency="USD"
  qrData="https://bakong.example.com/pay"
  className="my-custom-class"
/>
```

## For Merchants

### Using in Your Website

1. Copy the component files to your project
2. Import and use:

```tsx
import { KhqrCard } from "@/components";

// In your payment page
<KhqrCard
  receiverName="Your Business Name"
  amount={cartTotal}
  currency="USD"
  qrData={`https://your-domain.com/pay?amount=${cartTotal}`}
/>;
```

3. Style and position as needed using the `width` prop and container styling

### Recommended Positions

- Invoice/Bill: Right side, next to summary
- Mobile app: Full width or centered in checkout
- POS: Display above receipt printer
- Digital menu: Next to "Pay Now" section

## Browser Support

Works in all modern browsers supporting:

- React 16.8+
- CSS Flexbox
- CSS Grid (optional, for layout)

## Dependencies

- `qrcode.react` (included): For QR code generation
- `react`: ^16.8
- `next`: ^12 (if using Next.js)

## License

This component follows Bakong KHQR guidelines and specifications.
