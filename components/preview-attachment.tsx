import type { Attachment } from '@/lib/types';
import { Loader } from './elements/loader';
import { CrossSmallIcon, } from './icons';
import { Button } from './ui/button';
import { FileIcon, FileTextIcon } from 'lucide-react';

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
  onEdit,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
  onEdit?: () => void;
}) => {
  const { name, url, contentType } = attachment;

  const getFileIcon = () => {
    if (contentType?.startsWith('image')) {
      return null; // Return null to show image preview
    } else if (contentType === 'application/pdf') {
      return <FileTextIcon size={24} className="text-red-500" />;
    } else if (
      contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      contentType === 'application/msword'
    ) {
      return <FileTextIcon size={24} className="text-blue-500" />;
    } else {
      return <FileIcon size={24} className="text-gray-500" />;
    }
  };

  const fileIcon = getFileIcon();

  return (
    <div data-testid="input-attachment-preview" className="group relative w-16 h-16 rounded-lg overflow-hidden bg-muted border">
      {fileIcon === null ? (
        <img
          src={url}
          alt={name ?? 'An image attachment'}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {fileIcon}
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader size={16} />
        </div>
      )}

      {onRemove && !isUploading && (
        <Button
          onClick={onRemove}
          size="sm"
          variant="destructive"
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity size-4 p-0 rounded-full"
        >
          <CrossSmallIcon size={8} />
        </Button>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] px-1 py-0.5 truncate">
        {name}
      </div>
    </div>
  );
};
