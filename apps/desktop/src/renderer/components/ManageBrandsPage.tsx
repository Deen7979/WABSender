import React, { useEffect, useState } from "react";
import "./ManageBrandsPage.css";

type BrandItem = {
  id: string;
  name: string;
  company_name: string;
  phone: string;
  created_at: string;
};

type Props = {
  apiClient: any;
  activeBrandId: string | null;
  onSetActiveBrand: (brandId: string, brandName: string) => void;
  onCreateBrand: () => void;
  onOpenWhatsAppSetup: (brandId: string) => void;
};

export const ManageBrandsPage: React.FC<Props> = ({
  apiClient,
  activeBrandId,
  onSetActiveBrand,
  onCreateBrand,
  onOpenWhatsAppSetup,
}) => {
  const [items, setItems] = useState<BrandItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.listBrands({ page, pageSize, search }) as {
        items: BrandItem[];
        total: number;
      };
      setItems(response.items || []);
      setTotal(response.total || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load brands");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, pageSize, search]);

  const handleDelete = async (brandId: string) => {
    if (confirm(`Are you sure you want to delete this brand?`)) {
      try {
        setDeleting(brandId);
        await apiClient.deleteBrand(brandId);
        if (activeBrandId === brandId) {
          onSetActiveBrand("", "");
        }
        setPage(1);
        await load();
      } catch (err: any) {
        setError(err?.message || "Failed to delete brand");
      } finally {
        setDeleting(null);
      }
    }
  };

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="manage-brands-container">
      <div className="brands-card">
        {/* Header */}
        <div className="brands-header">
          <h2>Manage Brands</h2>
        </div>

        {/* Top Bar: Search + Dropdown + Create Button */}
        <div className="brands-top-bar">
          <div className="search-and-control">
            <div className="search-wrapper">
              <input
                type="text"
                className="search-input"
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Search by name or company"
              />
              <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 14L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="entries-control">
              <label htmlFor="page-size">Entries per page:</label>
              <select
                id="page-size"
                className="entries-dropdown"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>

            <button className="btn btn-primary" onClick={onCreateBrand}>
              + Create Brand
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && <div className="error-banner">{error}</div>}

        {/* Loading State */}
        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading brands...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && items.length === 0 && (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M12 8C9.79086 8 8 9.79086 8 12V36C8 38.2091 9.79086 40 12 40H36C38.2091 40 40 38.2091 40 36V12C40 9.79086 38.2091 8 36 8H12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 16H36M12 24H36M12 32H24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h3>No brands yet</h3>
            <p>Create your first brand to get started</p>
            <button className="btn btn-primary" onClick={onCreateBrand} style={{ marginTop: 16 }}>
              Create Brand
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && items.length > 0 && (
          <div className="table-wrapper">
            <table className="brands-table">
              <thead>
                <tr>
                  <th>Brand Name</th>
                  <th>Company</th>
                  <th>Phone</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((brand) => (
                  <tr key={brand.id}>
                    <td className="cell-brand-name">
                      <div className="brand-name-content">
                        <span className="brand-name">{brand.name}</span>
                        <span className="brand-id">ID: {brand.id.slice(0, 8)}...</span>
                      </div>
                    </td>
                    <td className="cell-company">{brand.company_name}</td>
                    <td className="cell-phone">{brand.phone}</td>
                    <td className="cell-created">{formatDate(brand.created_at)}</td>
                    <td className="cell-status">
                      {activeBrandId === brand.id && (
                        <span className="status-active-badge">Active</span>
                      )}
                    </td>
                    <td className="cell-actions">
                      <div className="actions-group">
                        <button
                          className="action-btn action-whatsapp"
                          onClick={() => onOpenWhatsAppSetup(brand.id)}
                          title="Setup WhatsApp"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-4.955 1.234l-.355.214-.368-.057c-1.277-.197-2.508-.302-3.721-.245l2.514 1.832-.25.407c-1.41 2.286-1.75 4.959-.77 7.334.94 2.355 3.224 4.103 5.851 4.338 2.627.235 5.2-.846 6.705-2.72.993-1.206 1.578-2.758 1.576-4.39 0-1.256-.306-2.516-.91-3.655L19.41 9.28l-.395-.073c-1.304-.237-2.594-.37-3.848-.229l-.364.034-.37-.227A9.83 9.83 0 0011.05 6.979"/>
                          </svg>
                        </button>
                        <button
                          className="action-btn action-set-active"
                          onClick={() => onSetActiveBrand(brand.id, brand.name)}
                          disabled={activeBrandId === brand.id}
                          title={activeBrandId === brand.id ? "Current active brand" : "Set as active"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="1"/>
                            <path d="M12 2a10 10 0 0110 10 10 10 0 01-10 10A10 10 0 012 12 10 10 0 0112 2z"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                        </button>
                        <button
                          className="action-btn action-delete"
                          onClick={() => handleDelete(brand.id)}
                          disabled={deleting === brand.id}
                          title="Delete brand"
                        >
                          {deleting === brand.id ? (
                            <span className="spinner-small"></span>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && items.length > 0 && (
          <div className="brands-footer">
            <div className="pagination">
              <button
                className="pagination-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                title="Previous page"
              >
                ← Prev
              </button>
              <div className="pagination-info">
                <span className="page-display">Page {page} of {maxPage}</span>
                <span className="results-display">({items.length} of {total} brands)</span>
              </div>
              <button
                className="pagination-btn"
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                disabled={page >= maxPage}
                title="Next page"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
