import { PhoneIcon } from './icons/PhoneIcon';
import './PhoneButton.css';

export const PhoneButton = ({
  type = 'call',
  onClick,
}: {
  type?: 'call' | 'answer' | 'hangup';
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={
        'phone-button' +
        (type === 'call' ? ' call' : type === 'answer' ? ' answer' : '')
      }
    >
      <PhoneIcon
        style={type === 'hangup' ? { transform: 'rotate(135deg)' } : {}}
      />
    </button>
  );
};
