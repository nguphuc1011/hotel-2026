'use client';

import { useState } from 'react';
import { HotelService } from '@/services/hotel';
import { supabase } from '@/lib/supabase';

export default function TestSearchPage() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [directResults, setDirectResults] = useState<any[]>([]);

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      console.log('Searching via HotelService:', term);
      const data = await HotelService.searchCustomers(term);
      setResults(data);

      // Test direct query
      const cleanTerm = term.trim();
      const { data: dData, error: dError } = await supabase
      .from('customers')
      .select('*')
      .or(`full_name.ilike.%${cleanTerm}%,phone.ilike.%${cleanTerm}%,id_card.ilike.%${cleanTerm}%`)
      .limit(5);

      if (dError) {
        console.error('Direct query error:', dError);
        setError(dError.message);
      } else {
        setDirectResults(dData || []);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold mb-4">Test Search Function</h1>
      <div className="flex gap-2 mb-4">
        <input 
          className="border p-2 rounded flex-1"
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Enter search term..."
        />
        <button 
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={handleSearch}
        >
          Search
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="font-bold">Service Results:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto h-64">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
        <div>
          <h2 className="font-bold">Direct Query Results:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto h-64">
            {JSON.stringify(directResults, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
