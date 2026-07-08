import { PhoneIcon } from './icons/PhoneIcon';

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
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: 50,
        aspectRatio: 1,
        borderRadius: '50%',
        backgroundColor:
          type === 'call' ? '#0a9' : type === 'answer' ? '#0c0' : '#f00',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '2px 2px 5px rgba(0, 0, 0, 0.2)',
      }}
    >
      <PhoneIcon
        style={type === 'hangup' ? { transform: 'rotate(135deg)' } : {}}
      />
    </button>
  );
};
