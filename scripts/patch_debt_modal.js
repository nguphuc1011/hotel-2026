const fs = require('fs');

// 1. Patch CustomerDebtModal.tsx
let modalCode = fs.readFileSync('src/app/[slug]/tien/components/CustomerDebtModal.tsx', 'utf8').replace(/\r\n/g, '\n');

modalCode = modalCode.replace(
  `interface CustomerDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
}`,
  `interface CustomerDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotelId?: string;
}`
);

modalCode = modalCode.replace(
  `export default function CustomerDebtModal({ isOpen, onClose }: CustomerDebtModalProps) {`,
  `export default function CustomerDebtModal({ isOpen, onClose, hotelId }: CustomerDebtModalProps) {`
);

modalCode = modalCode.replace(
  `const data = await customerService.getDebtors();`,
  `const data = await customerService.getDebtors(hotelId);`
);

fs.writeFileSync('src/app/[slug]/tien/components/CustomerDebtModal.tsx', modalCode, 'utf8');
console.log('✅ Patched CustomerDebtModal.tsx');

// 2. Patch src/app/[slug]/tien/page.tsx
let pageCode = fs.readFileSync('src/app/[slug]/tien/page.tsx', 'utf8').replace(/\r\n/g, '\n');

pageCode = pageCode.replace(
  `const debtors = await customerService.getDebtors();`,
  `const debtors = await customerService.getDebtors(user?.hotel_id);`
);

pageCode = pageCode.replace(
  `<CustomerDebtModal isOpen={isCustomerDebtModalOpen} onClose={() => setIsCustomerDebtModalOpen(false)} />`,
  `<CustomerDebtModal isOpen={isCustomerDebtModalOpen} onClose={() => setIsCustomerDebtModalOpen(false)} hotelId={user?.hotel_id} />`
);

fs.writeFileSync('src/app/[slug]/tien/page.tsx', pageCode, 'utf8');
console.log('✅ Patched src/app/[slug]/tien/page.tsx');
