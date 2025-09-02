'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import { chaosRunesAbi } from '@/lib/abi';

const RUNES_ADDRESS = process.env.NEXT_PUBLIC_RUNES_ADDRESS as `0x${string}`;

const ALL_RUNES_DATA = [
    { id: 0, name: "Rune of Flux", image: "/0.png", description: "Pulsates with unstable energy." },
    { id: 1, name: "Rune of Entropy", image: "/1.png", description: "Hums with cosmic decay." },
    { id: 2, name: "Rune of Gravity", image: "/2.png", description: "Bends the space around it." },
    { id: 3, name: "Rune of Singularity", image: "/3.png", description: "Born from a collapsed star." },
    { id: 4, name: "Rune of Parallax", image: "/4.png", description: "Refracts reality itself." },
];

export default function CollectionPage() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [ownedRuneIds, setOwnedRuneIds] = useState<Set<number>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchOwnedRunes = async () => {
            if (!publicClient || !address) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setOwnedRuneIds(new Set()); 

            try {
                // --- THIS IS THE FIX ---
                // We can now go back to the efficient method because the new contract works!

                // 1. Get the number of NFTs the user owns. This is now reliable.
                const balance = await publicClient.readContract({
                    address: RUNES_ADDRESS,
                    abi: chaosRunesAbi,
                    functionName: 'balanceOf',
                    args: [address]
                });

                const balanceNumber = Number(balance);
                if (balanceNumber === 0) {
                    setIsLoading(false);
                    return;
                }

                const ownedIds = new Set<number>();
                
                // 2. For each NFT they own, get its ID. This function is now reliable.
                for (let i = 0; i < balanceNumber; i++) {
                    const tokenId = await publicClient.readContract({
                        address: RUNES_ADDRESS,
                        abi: chaosRunesAbi,
                        functionName: 'tokenOfOwnerByIndex',
                        args: [address, BigInt(i)]
                    });
                    const runeType = Number(tokenId) % 5;
                    ownedIds.add(runeType);
                }

                setOwnedRuneIds(ownedIds);

            } catch (e) {
                console.error("A critical error occurred while fetching runes:", e); 
                toast.error("Could not load your NFT collection from the blockchain.");
            } finally {
                setIsLoading(false);
            }
        }
        fetchOwnedRunes();
    }, [address, publicClient]);

    return (
        <main className="mx-auto max-w-7xl px-6 py-12">
            <div className="text-center">
                <h1 className="text-4xl font-extrabold">Your Forged Runes</h1>
                <p className="mt-2 text-white/60">Your collection of permanent, on-chain artifacts.</p>
            </div>
            <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-lg bg-white/5 p-4 aspect-square animate-pulse" />
                ))}
                
                {!isLoading && ALL_RUNES_DATA.map(rune => {
                    const isUnlocked = ownedRuneIds.has(rune.id);
                    return (
                        <div 
                            key={rune.id} 
                            className={`rounded-lg bg-white/5 p-4 ring-1 ring-white/10 text-center transition-all duration-500 ${isUnlocked ? 'filter-none' : 'grayscale brightness-50'}`}
                        >
                            <img src={rune.image} alt={rune.name} className="w-full h-auto rounded-md aspect-square bg-black/20" />
                            <p className="font-semibold mt-3 text-sm truncate" title={rune.name}>{rune.name}</p>
                            <p className="text-xs text-white/50 truncate">{rune.description}</p>
                            {!isUnlocked && (
                                <div className="mt-2 text-xs font-bold uppercase text-gray-400">Locked</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
