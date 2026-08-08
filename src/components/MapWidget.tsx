'use client';
import dynamic from 'next/dynamic';

const MapCore = dynamic(() => import('./MapCore'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-black text-red-500 font-mono animate-pulse">
      [ INITIALIZING GLOBAL RADAR... ]
    </div>
  )
});

export default function MapWidget() {
  return (
    <div className="absolute inset-0 h-full w-full z-0 bg-black">
      <MapCore />
    </div>
  );
}