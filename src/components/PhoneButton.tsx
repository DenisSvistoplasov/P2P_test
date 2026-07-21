import { PhoneIcon } from './icons/PhoneIcon';
import './PhoneButton.css';

export const PhoneButton = ({
  type = 'call',
  onClick,
  style
}: {
  type?: 'call' | 'answer' | 'hangup';
    onClick: () => void;
  style?: React.CSSProperties;
}) => {
  return (
    <button
      onClick={onClick}
      className={
        'phone-button' +
        (type === 'call' ? ' call' : type === 'answer' ? ' answer' : '')
      }
      style={style}
    >
      <PhoneIcon
        style={type === 'hangup' ? { transform: 'rotate(135deg)' } : {}}
      />
    </button>
  );
};
