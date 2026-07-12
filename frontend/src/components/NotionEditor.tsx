"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import { FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import { MathExtension } from '@aarkue/tiptap-math-extension';
import { Node, mergeAttributes } from '@tiptap/core';
import { useEffect, useRef } from 'react';
import { ImageIcon, Link as LinkIcon, FileText, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from "./Toast";

const PDFEmbed = Node.create({
  name: 'pdfEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'iframe[data-pdf="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes, { class: 'w-full h-[600px] border border-[#34302B] rounded-lg my-4', 'data-pdf': 'true' })];
  },
});

interface NotionEditorProps {
  noteId: number;
  initialContent: string;
  onChange: (content: string) => void;
  editable?: boolean;
}

export default function NotionEditor({ noteId, initialContent, onChange, editable = true }: NotionEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-xl max-w-full my-4 border border-[#34302B]',
        },
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: {
          class: 'text-[#A7C4A0] underline hover:text-white transition-colors',
        },
      }),
      PDFEmbed,
      Typography,
      MathExtension.configure({ evaluation: false }),
      Placeholder.configure({
        placeholder: 'Start writing or use markdown (e.g., # for headings, [] for tasks)...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: initialContent,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm sm:prose-base focus:outline-none max-w-none min-h-[500px] pb-32',
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            api.uploadFile(file).then(({ url }) => {
              const { schema } = view.state;
              const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const node = schema.nodes.image.create({ src: url });
              const transaction = view.state.tr.insert(coordinates?.pos || 0, node);
              view.dispatch(transaction);
            }).catch(console.error);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event, slice) => {
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
          const file = event.clipboardData.files[0];
          if (file.type.startsWith('image/')) {
            api.uploadFile(file).then(({ url }) => {
              const { schema } = view.state;
              const node = schema.nodes.image.create({ src: url });
              const transaction = view.state.tr.replaceSelectionWith(node);
              view.dispatch(transaction);
            }).catch(console.error);
            return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Handle external updates to content when switching notes
  useEffect(() => {
    if (editor) {
      editor.commands.setContent(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  if (!editor) {
    return null;
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await api.uploadFile(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error(err);
      toast("Couldn't upload the image.", "error");
    }
    e.target.value = '';
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await api.uploadFile(file);
      editor.chain().focus().insertContent({ type: 'pdfEmbed', attrs: { src: url } }).run();
    } catch (err) {
      console.error(err);
      toast("Couldn't upload the PDF.", "error");
    }
    e.target.value = '';
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-col h-full w-full">
      {editable && (
        <div className="flex items-center gap-1 mb-4 p-2 bg-[#1D1B19] border border-[#34302B] rounded-xl flex-wrap">
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
          <input type="file" accept="application/pdf" className="hidden" ref={pdfInputRef} onChange={handlePdfUpload} />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-[#A29A8B] hover:bg-[#34302B] hover:text-white transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5" /> Add Image
          </button>
          
          <button
            onClick={() => pdfInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-[#A29A8B] hover:bg-[#34302B] hover:text-white transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> Add PDF
          </button>
          
          <div className="w-px h-4 bg-[#34302B] mx-1"></div>
          
          <button
            onClick={setLink}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              editor.isActive('link') ? 'bg-[#A7C4A0]/10 text-[#A7C4A0]' : 'text-[#A29A8B] hover:bg-[#34302B] hover:text-white'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" /> {editor.isActive('link') ? 'Edit Link' : 'Add Link'}
          </button>
        </div>
      )}

      <div className="w-full text-white h-full relative cursor-text group" onClick={() => editor.chain().focus().run()}>
        <FloatingMenu editor={editor}>
          <div className="flex bg-[#1D1B19] border border-[#34302B] shadow-xl rounded-lg overflow-hidden">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-white hover:bg-[#34302B] transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-[#A7C4A0]" /> Image
            </button>
            <div className="w-px bg-[#34302B]"></div>
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-white hover:bg-[#34302B] transition-colors"
            >
              <FileText className="w-4 h-4 text-[#A7C4A0]" /> PDF
            </button>
            <div className="w-px bg-[#34302B]"></div>
            <button
              onClick={setLink}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-white hover:bg-[#34302B] transition-colors"
            >
              <LinkIcon className="w-4 h-4 text-[#A7C4A0]" /> Link
            </button>
          </div>
        </FloatingMenu>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
